const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_admin') {
      req.user = { id: 'user_admin_support_1', name: 'Admin', isAdmin: true };
    } else if (token === 'mock_token_member') {
      req.user = { id: 'user_member_support_1', name: 'Member', isAdmin: false };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
  clerkClient: { users: { updateUserMetadata: jest.fn().mockResolvedValue({}) } },
}));

jest.mock('../workers/gameReminderWorker', () => ({ startGameReminderWorker: jest.fn() }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('Support messages (bug reports / feedback)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await Promise.all(
      ['user_admin_support_1', 'user_member_support_1'].map((id) =>
        prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } })
      )
    );
  });

  afterAll(async () => {
    await prisma.supportMessage.deleteMany({
      where: { userId: { in: ['user_admin_support_1', 'user_member_support_1'] } },
    });
    await prisma.$disconnect();
  });

  test('POST /api/support requires auth', async () => {
    const res = await request(app).post('/api/support').send({ type: 'BUG', message: 'crashes on submit' });
    expect(res.statusCode).toEqual(401);
  });

  test('POST /api/support rejects an invalid type', async () => {
    const res = await request(app)
      .post('/api/support')
      .set('Authorization', 'Bearer mock_token_member')
      .send({ type: 'NOT_A_TYPE', message: 'hello' });
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/support rejects an empty message', async () => {
    const res = await request(app)
      .post('/api/support')
      .set('Authorization', 'Bearer mock_token_member')
      .send({ type: 'BUG', message: '   ' });
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/support rejects a message over 2000 characters', async () => {
    const res = await request(app)
      .post('/api/support')
      .set('Authorization', 'Bearer mock_token_member')
      .send({ type: 'BUG', message: 'x'.repeat(2001) });
    expect(res.statusCode).toEqual(400);
  });

  test('POST /api/support creates an OPEN message owned by the caller', async () => {
    const res = await request(app)
      .post('/api/support')
      .set('Authorization', 'Bearer mock_token_member')
      .send({ type: 'FEEDBACK', message: 'love the app', context: '/games/new' });
    expect(res.statusCode).toEqual(201);
    expect(res.body.status).toEqual('OPEN');
    expect(res.body.userId).toEqual('user_member_support_1');
    expect(res.body.context).toEqual('/games/new');
  });

  describe('admin endpoints', () => {
    let messageId;

    beforeEach(async () => {
      const created = await prisma.supportMessage.create({
        data: { userId: 'user_member_support_1', type: 'BUG', message: 'admin-flow test message' },
      });
      messageId = created.id;
    });

    test('GET /api/admin/support-messages requires admin', async () => {
      const res = await request(app)
        .get('/api/admin/support-messages')
        .set('Authorization', 'Bearer mock_token_member');
      expect(res.statusCode).toEqual(403);
    });

    test('GET /api/admin/support-messages lists rows with the submitter attached', async () => {
      const res = await request(app)
        .get('/api/admin/support-messages')
        .set('Authorization', 'Bearer mock_token_admin');
      expect(res.statusCode).toEqual(200);
      const row = res.body.find((r) => r.id === messageId);
      expect(row).toBeTruthy();
      expect(row.user).toEqual(expect.objectContaining({ id: 'user_member_support_1' }));
    });

    test('POST .../resolve requires admin', async () => {
      const res = await request(app)
        .post(`/api/admin/support-messages/${messageId}/resolve`)
        .set('Authorization', 'Bearer mock_token_member');
      expect(res.statusCode).toEqual(403);
    });

    test('POST .../resolve marks the message resolved and returns the submitter (regression: was undefined)', async () => {
      const res = await request(app)
        .post(`/api/admin/support-messages/${messageId}/resolve`)
        .set('Authorization', 'Bearer mock_token_admin');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('RESOLVED');
      expect(res.body.resolvedAt).toBeTruthy();
      expect(res.body.user).toEqual(expect.objectContaining({ id: 'user_member_support_1' }));
    });

    test('POST .../resolve on an unknown id returns 404', async () => {
      const res = await request(app)
        .post('/api/admin/support-messages/does-not-exist/resolve')
        .set('Authorization', 'Bearer mock_token_admin');
      expect(res.statusCode).toEqual(404);
    });
  });
});
