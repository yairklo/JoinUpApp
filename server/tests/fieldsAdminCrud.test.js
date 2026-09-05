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
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_member')
      .send({ name: 'FieldsPilotShouldNotExist', location: 'Nowhere', type: 'open' });

    expect(res.statusCode).toEqual(403);
    // Scoped to this test's own field name, not a global count — a global count.field.count()
    // before/after comparison is a real flake risk under concurrent test runs against the
    // shared dev DB (an unrelated field created/deleted by another process in between the two
    // counts throws the comparison off); this stays correct no matter what else is running.
    const leaked = await prisma.field.findFirst({ where: { name: 'FieldsPilotShouldNotExist' } });
    expect(leaked).toBeNull();
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
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ location: 'Missing Name Ave', type: 'open' });

    expect(res.statusCode).toEqual(400);
    // Scoped by location (the one distinguishing field sent), same concurrency reasoning as above.
    const leaked = await prisma.field.findFirst({ where: { location: 'Missing Name Ave' } });
    expect(leaked).toBeNull();
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

  test('POST /api/fields persists the extended optional fields when provided', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotExtended',
        location: 'FieldsPilot Extended Ave',
        city: 'FieldsPilotCity',
        type: 'open',
        description: 'A lovely pitch',
        supportedSports: ['soccer', 'basketball'],
        phone: '050-1234567',
        email: 'field@example.com',
        neighborhood: 'FieldsPilot Heights',
        street: 'FieldsPilot St',
        streetNumber: '12',
        lat: 32.0853,
        lng: 34.7818,
      });

    expect(res.statusCode).toEqual(201);
    createdIds.push(res.body.id);

    expect(res.body.description).toEqual('A lovely pitch');
    expect(res.body.supportedSports).toEqual(['SOCCER', 'BASKETBALL']);
    expect(res.body.phone).toEqual('050-1234567');
    expect(res.body.email).toEqual('field@example.com');
    expect(res.body.neighborhood).toEqual('FieldsPilot Heights');
    expect(res.body.street).toEqual('FieldsPilot St');
    expect(res.body.streetNumber).toEqual('12');
    expect(res.body.lat).toEqual(32.0853);
    expect(res.body.lng).toEqual(34.7818);
  });

  test('POST /api/fields with an invalid supportedSports value is 400, creates nothing', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotBadSport',
        location: 'FieldsPilot Bad Sport Ave',
        type: 'open',
        supportedSports: ['soccer', 'chess'],
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/supportedSports/i);
    const leaked = await prisma.field.findFirst({ where: { name: 'FieldsPilotBadSport' } });
    expect(leaked).toBeNull();
  });

  test('POST /api/fields with an empty supportedSports array is 400, creates nothing', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotEmptySports',
        location: 'FieldsPilot Empty Sports Ave',
        type: 'open',
        supportedSports: [],
      });

    expect(res.statusCode).toEqual(400);
    const leaked = await prisma.field.findFirst({ where: { name: 'FieldsPilotEmptySports' } });
    expect(leaked).toBeNull();
  });

  test('POST /api/fields with a non-numeric lat is 400, creates nothing', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotBadLat',
        location: 'FieldsPilot Bad Lat Ave',
        type: 'open',
        lat: 'not-a-number',
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/lat/i);
    const leaked = await prisma.field.findFirst({ where: { name: 'FieldsPilotBadLat' } });
    expect(leaked).toBeNull();
  });

  test('PUT /api/fields/:id updates the extended optional fields', async () => {
    const created = await prisma.field.create({
      data: {
        name: 'FieldsPilotExtendedUpdate',
        location: 'FieldsPilot Extended Update Ave',
        type: 'OPEN',
      },
    });
    createdIds.push(created.id);

    const res = await request(app)
      .put(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        supportedSports: ['tennis'],
        lat: 31.771959,
        lng: 35.217018,
        phone: '02-9999999',
        description: 'Updated description',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.supportedSports).toEqual(['TENNIS']);
    expect(res.body.lat).toEqual(31.771959);
    expect(res.body.lng).toEqual(35.217018);
    expect(res.body.phone).toEqual('02-9999999');
    expect(res.body.description).toEqual('Updated description');
    // name was not in the PUT body — must be unchanged.
    expect(res.body.name).toEqual('FieldsPilotExtendedUpdate');
  });

  test('PUT /api/fields/:id with an invalid supportedSports value is 400, leaves the row unchanged', async () => {
    const created = await prisma.field.create({
      data: {
        name: 'FieldsPilotBadUpdate',
        location: 'FieldsPilot Bad Update Ave',
        type: 'OPEN',
        supportedSports: ['SOCCER'],
      },
    });
    createdIds.push(created.id);

    const res = await request(app)
      .put(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ supportedSports: ['volleyball'] });

    expect(res.statusCode).toEqual(400);

    const unchanged = await prisma.field.findUnique({ where: { id: created.id } });
    expect(unchanged.supportedSports).toEqual(['SOCCER']);
  });

  test('PUT /api/fields/:id with a non-numeric lng is 400, leaves the row unchanged', async () => {
    const created = await prisma.field.create({
      data: {
        name: 'FieldsPilotBadLngUpdate',
        location: 'FieldsPilot Bad Lng Update Ave',
        type: 'OPEN',
        lng: 34.5,
      },
    });
    createdIds.push(created.id);

    const res = await request(app)
      .put(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ lng: 'not-a-number' });

    expect(res.statusCode).toEqual(400);

    const unchanged = await prisma.field.findUnique({ where: { id: created.id } });
    expect(unchanged.lng).toEqual(34.5);
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
