const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_ns_user') {
      req.user = { id: 'user_ns_1', name: 'NS User' };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('GET/PUT /api/notifications/settings', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.upsert({ where: { id: 'user_ns_1' }, update: {}, create: { id: 'user_ns_1', name: 'NS User' } });
  });

  afterAll(async () => {
    await prisma.userNotificationSettings.deleteMany({ where: { userId: 'user_ns_1' } });
    await prisma.$disconnect();
  });

  test('GET without a token is 401', async () => {
    const res = await request(app).get('/api/notifications/settings');
    expect(res.statusCode).toEqual(401);
  });

  test('GET creates and returns default settings (push enabled) on first access', async () => {
    const res = await request(app)
      .get('/api/notifications/settings')
      .set('Authorization', 'Bearer mock_token_ns_user');
    expect(res.statusCode).toEqual(200);
    expect(res.body.pushEnabled).toBe(true);
    expect(res.body.messagesEnabled).toBe(true);
  });

  test('PUT persists a change that a subsequent GET reflects', async () => {
    const putRes = await request(app)
      .put('/api/notifications/settings')
      .set('Authorization', 'Bearer mock_token_ns_user')
      .send({ pushEnabled: false });
    expect(putRes.statusCode).toEqual(200);
    expect(putRes.body.pushEnabled).toBe(false);

    const getRes = await request(app)
      .get('/api/notifications/settings')
      .set('Authorization', 'Bearer mock_token_ns_user');
    expect(getRes.body.pushEnabled).toBe(false);
  });
});
