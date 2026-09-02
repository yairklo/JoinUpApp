const request = require('supertest');

jest.setTimeout(30000);

const mockUpdateUserMetadata = jest.fn().mockResolvedValue({});

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_admin') {
      req.user = { id: 'user_admin_1', name: 'Admin', isAdmin: true };
    } else if (token === 'mock_token_member') {
      req.user = { id: 'user_member_1', name: 'Member', isAdmin: false };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
  clerkClient: {
    users: {
      updateUserMetadata: (...args) => mockUpdateUserMetadata(...args),
    },
  },
}));

jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn(),
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
      ['user_admin_1', 'user_member_1'].map((id) =>
        prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } })
      )
    );
    await prisma.chatRoom.create({
      data: {
        id: roomId,
        type: 'PRIVATE',
        participants: { create: [{ userId: 'user_member_1' }] },
      },
    });
    const message = await prisma.message.create({
      data: { chatRoomId: roomId, userId: 'user_member_1', text: 'original content' },
    });
    messageId = message.id;

    const flagged = await prisma.flaggedMessage.create({
      data: { messageId, content: 'original content', userId: 'user_member_1' },
    });
    flaggedId = flagged.id;
  });

  afterAll(async () => {
    await prisma.flaggedMessage.deleteMany({ where: { userId: 'user_member_1' } });
    await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
    await prisma.chatParticipant.deleteMany({ where: { chatId: roomId } });
    await prisma.chatRoom.deleteMany({ where: { id: roomId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockUpdateUserMetadata.mockClear();
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
    expect(res.body.some((row) => row.id === flaggedId)).toBe(true);
  });

  test('POST .../ban requires admin', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_member_1/ban')
      .set('Authorization', 'Bearer mock_token_member');
    expect(res.statusCode).toEqual(403);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('POST .../ban rejects self-ban', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_admin_1/ban')
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(400);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('POST .../ban sets isBanned via Clerk metadata', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_member_1/ban')
      .set('Authorization', 'Bearer mock_token_admin')
      .send({ reason: 'test abuse' });
    expect(res.statusCode).toEqual(200);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
      'user_member_1',
      expect.objectContaining({ privateMetadata: expect.objectContaining({ isBanned: true, banReason: 'test abuse' }) })
    );
  });

  test('POST .../unban clears isBanned via Clerk metadata', async () => {
    const res = await request(app)
      .post('/api/admin/users/user_member_1/unban')
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(200);
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
      'user_member_1',
      expect.objectContaining({ privateMetadata: expect.objectContaining({ isBanned: false }) })
    );
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
      data: { messageId, content: 'another one', userId: 'user_member_1' },
    });
    const res = await request(app)
      .post(`/api/admin/flagged-messages/${secondFlagged.id}/dismiss`)
      .set('Authorization', 'Bearer mock_token_admin');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('RESOLVED');
    expect(res.body.resolution).toEqual('ADMIN_DISMISSED:user_admin_1');
  });
});
