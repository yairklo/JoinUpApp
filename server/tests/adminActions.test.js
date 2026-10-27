const request = require('supertest');

jest.setTimeout(30000);

// Unique per run so this suite never depends on (or is broken by) users left by other suites.
const mockRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const mockAdminId = `test_adminactions_admin_${mockRunId}`;
const mockMemberId = `test_adminactions_member_${mockRunId}`;

const mockUpdateUserMetadata = jest.fn().mockResolvedValue({});
const mockInvalidateClerkUser = jest.fn();

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_admin') {
      req.user = { id: mockAdminId, name: 'Admin', isAdmin: true };
    } else if (token === 'mock_token_member') {
      req.user = { id: mockMemberId, name: 'Member', isAdmin: false };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
  invalidateClerkUser: (...args) => mockInvalidateClerkUser(...args),
  clerkClient: {
    users: {
      updateUserMetadata: (...args) => mockUpdateUserMetadata(...args),
    },
  },
}));

jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('Admin moderation actions', () => {
  const roomId = `test_admin_chat_${Date.now()}`;
  let messageId;
  let flaggedId;

  beforeAll(async () => {
    await prisma.$connect();
    await Promise.all(
      [mockAdminId, mockMemberId].map((id) =>
        prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } })
      )
    );
    await prisma.chatRoom.create({
      data: {
        id: roomId,
        type: 'PRIVATE',
        participants: { create: [{ userId: mockMemberId }] },
      },
    });
    const message = await prisma.message.create({
      data: { chatRoomId: roomId, userId: mockMemberId, text: 'original content' },
    });
    messageId = message.id;

    const flagged = await prisma.flaggedMessage.create({
      data: {
        messageId,
        content: 'original content',
        userId: mockMemberId,
        aiTriggers: { source: 'user_report', reason: 'OFFENSIVE', reporterId: mockAdminId },
      },
    });
    flaggedId = flagged.id;
  });

  afterAll(async () => {
    await prisma.flaggedMessage.deleteMany({ where: { userId: mockMemberId } });
    await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
    await prisma.chatParticipant.deleteMany({ where: { chatId: roomId } });
    await prisma.chatRoom.deleteMany({ where: { id: roomId } });
    await prisma.user.deleteMany({ where: { id: { in: [mockAdminId, mockMemberId] } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockUpdateUserMetadata.mockClear();
    mockInvalidateClerkUser.mockClear();
  });

  test('GET /api/admin/flagged-messages requires admin', async () => {
    const res = await request(app)
      .get('/api/admin/flagged-messages')
      .set('Authorization', 'Bearer mock_token_member');
    expect(res.statusCode).toEqual(403);
  });

  test('GET /api/admin/flagged-messages lists rows for an admin', async () => {
    const res = await request(app)
      .get('/api/admin/flagged-messages')
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(200);
    const row = res.body.find((r) => r.id === flaggedId);
    expect(row).toBeDefined();
    // Sender and reporter are resolved to names so moderators aren't left with raw ids.
    expect(row.sender).toMatchObject({ id: mockMemberId, name: mockMemberId });
    expect(row.reporter).toMatchObject({ id: mockAdminId, name: mockAdminId });
  });

  test('POST .../ban requires admin', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${mockMemberId}/ban`)
      .set('Authorization', 'Bearer mock_token_member');
    expect(res.statusCode).toEqual(403);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('POST .../ban rejects self-ban', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${mockAdminId}/ban`)
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(400);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('POST .../ban sets isBanned via Clerk metadata', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${mockMemberId}/ban`)
      .set('Authorization', 'Bearer mock_token_admin')
      .send({ reason: 'test abuse' });
    expect(res.statusCode).toEqual(200);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
      mockMemberId,
      expect.objectContaining({ privateMetadata: expect.objectContaining({ isBanned: true, banReason: 'test abuse' }) })
    );
    expect(mockInvalidateClerkUser).toHaveBeenCalledWith(mockMemberId);
  });

  test('POST .../unban clears isBanned via Clerk metadata', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${mockMemberId}/unban`)
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(200);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
      mockMemberId,
      expect.objectContaining({ privateMetadata: expect.objectContaining({ isBanned: false }) })
    );
    expect(mockInvalidateClerkUser).toHaveBeenCalledWith(mockMemberId);
  });

  test('POST .../remove-message redacts the underlying message and resolves the flag', async () => {
    const res = await request(app)
      .post(`/api/admin/flagged-messages/${flaggedId}/remove-message`)
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('RESOLVED');

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    expect(message.status).toEqual('rejected');
    expect(message.text).toEqual('[Message removed by moderator]');
  });

  test('POST .../dismiss marks the flag resolved without touching the message', async () => {
    const secondFlagged = await prisma.flaggedMessage.create({
      data: { messageId, content: 'another one', userId: mockMemberId },
    });
    const res = await request(app)
      .post(`/api/admin/flagged-messages/${secondFlagged.id}/dismiss`)
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('RESOLVED');
    expect(res.body.resolution).toEqual(`ADMIN_DISMISSED:${mockAdminId}`);
  });

  test('resolved flags leave the queue, including other reports on the same message', async () => {
    const a = await prisma.flaggedMessage.create({
      data: { messageId, content: 'dup report a', userId: mockMemberId, status: 'PENDING_REVIEW' },
    });
    const b = await prisma.flaggedMessage.create({
      data: { messageId, content: 'dup report b', userId: mockMemberId, status: 'PENDING_REVIEW' },
    });

    const before = await request(app)
      .get('/api/admin/flagged-messages')
      .set('Authorization', 'Bearer mock_token_admin');
    expect(before.body.some((r) => r.id === a.id)).toBe(true);
    expect(before.body.some((r) => r.id === b.id)).toBe(true);

    const dismiss = await request(app)
      .post(`/api/admin/flagged-messages/${a.id}/dismiss`)
      .set('Authorization', 'Bearer mock_token_admin');
    expect(dismiss.statusCode).toEqual(200);

    const after = await request(app)
      .get('/api/admin/flagged-messages')
      .set('Authorization', 'Bearer mock_token_admin');
    expect(after.body.some((r) => r.id === a.id || r.id === b.id)).toBe(false);
    expect(after.body.every((r) => r.status !== 'RESOLVED')).toBe(true);
    expect((await prisma.flaggedMessage.findUnique({ where: { id: b.id } })).status).toEqual('RESOLVED');
  });
});
