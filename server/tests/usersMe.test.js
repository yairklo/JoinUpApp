const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_admin') {
      req.user = { id: 'user_admin_1', name: 'Admin', isAdmin: true };
    } else if (token === 'mock_token_organizer') {
      req.user = { id: 'user_org_123', name: 'Organizer', isAdmin: false };
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

describe('Current user + admin field writes', () => {
  const createdIds = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.upsert({
      where: { id: 'user_admin_1' },
      update: { name: 'Admin' },
      create: { id: 'user_admin_1', name: 'Admin' },
    });
    await prisma.user.upsert({
      where: { id: 'user_org_123' },
      update: {},
      create: { id: 'user_org_123', name: 'Organizer' },
    });
  });

  afterAll(async () => {
    try {
      if (createdIds.length) {
        await prisma.field.deleteMany({ where: { id: { in: createdIds } } });
      }
    } catch (err) {
      console.warn('usersMe cleanup skipped:', err.message);
    }
  });

  test('GET /api/users/me without token is 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.statusCode).toEqual(401);
  });

  test('GET /api/users/me reports isAdmin from auth', async () => {
    const admin = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer mock_admin');
    expect(admin.statusCode).toEqual(200);
    expect(admin.body.id).toEqual('user_admin_1');
    expect(admin.body.isAdmin).toEqual(true);

    const member = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer mock_token_organizer');
    expect(member.statusCode).toEqual(200);
    expect(member.body.isAdmin).toEqual(false);
  });

  test('POST /api/fields as non-admin is 403', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_token_organizer')
      .send({ name: 'Test pitch', location: 'Tel Aviv', type: 'open' });
    expect(res.statusCode).toEqual(403);
  });

  test('POST /api/fields as admin creates a field', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_admin')
      .send({ name: 'Admin Test Field', location: 'Haifa', city: 'חיפה', type: 'open' });
    expect(res.statusCode).toEqual(201);
    expect(res.body.name).toEqual('Admin Test Field');
    expect(res.body.city).toEqual('חיפה');
    expect(res.body.type).toEqual('open');
    if (res.body.id) createdIds.push(res.body.id);
  });

  test('GET /api/admin/flagged-messages is admin-only', async () => {
    const denied = await request(app)
      .get('/api/admin/flagged-messages')
      .set('Authorization', 'Bearer mock_token_organizer');
    expect(denied.statusCode).toEqual(403);
    const ok = await request(app)
      .get('/api/admin/flagged-messages')
      .set('Authorization', 'Bearer mock_admin');
    expect(ok.statusCode).toEqual(200);
    expect(Array.isArray(ok.body)).toEqual(true);
  });
});
