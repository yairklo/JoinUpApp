const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_fields_admin') {
      req.user = { id: 'user_fieldspilot_admin', name: 'FieldsPilotAdmin', isAdmin: true };
    } else if (token === 'mock_fields_member') {
      req.user = { id: 'user_fieldspilot_member', name: 'FieldsPilotMember', isAdmin: false };
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

describe('Admin-gated Field CRUD (POST/PUT/DELETE /api/fields)', () => {
  const createdIds = [];

  afterAll(async () => {
    try {
      if (createdIds.length) {
        await prisma.field.deleteMany({ where: { id: { in: createdIds } } });
      }
    } catch (err) {
      console.warn('fieldsAdminCrud cleanup skipped:', err.message);
    }
  });

  test('POST /api/fields as non-admin is 403 and creates nothing', async () => {
    const before = await prisma.field.count();

    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_member')
      .send({ name: 'FieldsPilotShouldNotExist', location: 'Nowhere', type: 'open' });

    expect(res.statusCode).toEqual(403);
    const after = await prisma.field.count();
    expect(after).toEqual(before);
  });

  test('POST /api/fields as admin creates a field (mapped shape)', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ name: 'FieldsPilotCreated', location: 'FieldsPilot Ave', city: 'FieldsPilotCity', type: 'open' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.type).toEqual('open');
    expect(res.body.favoritesCount).toEqual(0);
    expect(res.body.upcomingGamesCount).toEqual(0);
    expect(res.body.id).toBeTruthy();

    createdIds.push(res.body.id);
  });

  test('POST /api/fields missing a required field is 400, nothing created', async () => {
    const before = await prisma.field.count();

    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ location: 'Missing Name Ave', type: 'open' });

    expect(res.statusCode).toEqual(400);
    const after = await prisma.field.count();
    expect(after).toEqual(before);
  });

  test('PUT /api/fields/:id as admin updates only the supplied fields', async () => {
    const created = await prisma.field.create({
      data: {
        name: 'FieldsPilotBeforeUpdate',
        location: 'FieldsPilot Update Ave',
        city: 'FieldsPilotUpdateCity',
        type: 'OPEN',
      },
    });
    createdIds.push(created.id);

    const res = await request(app)
      .put(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ name: 'FieldsPilotAfterUpdate' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.name).toEqual('FieldsPilotAfterUpdate');
    // city was not in the PUT body — must be unchanged, not nulled.
    expect(res.body.city).toEqual('FieldsPilotUpdateCity');
  });

  test('DELETE /api/fields/:id as admin removes the row', async () => {
    const created = await prisma.field.create({
      data: { name: 'FieldsPilotToDelete', location: 'FieldsPilot Delete Ave', type: 'OPEN' },
    });

    const del = await request(app)
      .delete(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin');
    expect(del.statusCode).toEqual(200);

    const getAfter = await request(app).get(`/api/fields/${created.id}`);
    expect(getAfter.statusCode).toEqual(404);
  });
});
