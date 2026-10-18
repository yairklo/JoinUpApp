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
    await prisma.user.upsert({ where: { id: 'user_ns_2' }, update: {}, create: { id: 'user_ns_2', name: 'NS Friend' } });
  });

  afterAll(async () => {
    await prisma.notificationMute.deleteMany({ where: { userId: 'user_ns_1' } });
    await prisma.userNotificationSettings.deleteMany({ where: { userId: 'user_ns_1' } });
    await prisma.user.deleteMany({ where: { id: 'user_ns_2' } });
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

  const auth = ['Authorization', 'Bearer mock_token_ns_user'];

  test('GET returns the full preference DTO with new defaults', async () => {
    const res = await request(app).get('/api/notifications/settings').set(...auth);
    expect(res.statusCode).toEqual(200);
    expect(res.body.cityGamesPush).toBe(false);
    expect(res.body.cityGamesInApp).toBe(true);
    expect(res.body.cityGamesSports).toEqual([]);
    expect(res.body.timezone).toBe('Asia/Jerusalem');
    expect(Array.isArray(res.body.mutes)).toBe(true);
  });

  test('PUT persists new fields as a partial update', async () => {
    const res = await request(app).put('/api/notifications/settings').set(...auth).send({
      cityGamesPush: true, cityGamesSports: ['TENNIS'], quietHoursEnabled: true, quietHoursStart: 1320,
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toMatchObject({ cityGamesPush: true, cityGamesSports: ['TENNIS'], quietHoursEnabled: true, quietHoursStart: 1320 });
    // untouched field keeps its value from the earlier test
    expect(res.body.pushEnabled).toBe(false);
  });

  test('PUT with invalid values is 400 and changes nothing', async () => {
    const res = await request(app).put('/api/notifications/settings').set(...auth).send({ timezone: 'Mars/Base', quietHoursEnd: 5000 });
    expect(res.statusCode).toEqual(400);
    expect(res.body.details).toHaveLength(2);
    const after = await request(app).get('/api/notifications/settings').set(...auth);
    expect(after.body.timezone).toBe('Asia/Jerusalem');
  });

  test('snooze sets and clears snoozeUntil', async () => {
    const bad = await request(app).post('/api/notifications/settings/snooze').set(...auth).send({ hours: 3 });
    expect(bad.statusCode).toEqual(400);
    const on = await request(app).post('/api/notifications/settings/snooze').set(...auth).send({ hours: 2 });
    expect(on.statusCode).toEqual(200);
    expect(new Date(on.body.snoozeUntil).getTime()).toBeGreaterThan(Date.now() + 3600000);
    const off = await request(app).post('/api/notifications/settings/snooze').set(...auth).send({ hours: null });
    expect(off.body.snoozeUntil).toBeNull();
  });

  test('mute CRUD round trip', async () => {
    const add = await request(app).post('/api/notifications/mutes').set(...auth).send({ targetType: 'USER', targetId: 'user_ns_2', durationHours: 8 });
    expect(add.statusCode).toEqual(201);
    expect(add.body).toEqual([expect.objectContaining({ targetType: 'USER', targetId: 'user_ns_2', label: 'NS Friend' })]);

    const list = await request(app).get('/api/notifications/mutes').set(...auth);
    expect(list.body).toHaveLength(1);

    const settings = await request(app).get('/api/notifications/settings').set(...auth);
    expect(settings.body.mutes).toHaveLength(1);

    const del = await request(app).delete('/api/notifications/mutes/USER/user_ns_2').set(...auth);
    expect(del.statusCode).toEqual(200);
    expect(del.body).toEqual([]);
  });

  test('mute validation: self, unknown target, bad type', async () => {
    const self = await request(app).post('/api/notifications/mutes').set(...auth).send({ targetType: 'USER', targetId: 'user_ns_1' });
    expect(self.statusCode).toEqual(400);
    const missing = await request(app).post('/api/notifications/mutes').set(...auth).send({ targetType: 'GAME', targetId: 'no_such_game_ns' });
    expect(missing.statusCode).toEqual(404);
    const badType = await request(app).post('/api/notifications/mutes').set(...auth).send({ targetType: 'CITY', targetId: 'x' });
    expect(badType.statusCode).toEqual(400);
  });
});
