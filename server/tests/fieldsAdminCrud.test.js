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

  test('POST /api/fields as admin persists the new optional detail fields', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotExtrasCreated',
        location: 'FieldsPilot Extras Ave',
        type: 'open',
        description: 'A nice pitch',
        supportedSports: ['soccer', 'BASKETBALL'],
        phone: '050-1234567',
        email: 'field@example.com',
        neighborhood: 'FieldsPilot Hood',
        street: 'FieldsPilot St',
        streetNumber: '12',
        lat: 32.08,
        lng: 34.78,
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.supportedSports).toEqual(['SOCCER', 'BASKETBALL']);
    expect(res.body.description).toEqual('A nice pitch');
    expect(res.body.phone).toEqual('050-1234567');
    expect(res.body.email).toEqual('field@example.com');
    expect(res.body.neighborhood).toEqual('FieldsPilot Hood');
    expect(res.body.street).toEqual('FieldsPilot St');
    expect(res.body.streetNumber).toEqual('12');
    expect(res.body.lat).toEqual(32.08);
    expect(res.body.lng).toEqual(34.78);

    createdIds.push(res.body.id);
  });

  test('POST /api/fields with an invalid supportedSports entry is 400, nothing created', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotBadSports',
        location: 'FieldsPilot BadSports Ave',
        type: 'open',
        supportedSports: ['SOCCER', 'HOCKEY'],
      });

    expect(res.statusCode).toEqual(400);
    const leaked = await prisma.field.findFirst({ where: { name: 'FieldsPilotBadSports' } });
    expect(leaked).toBeNull();
  });

  test('POST /api/fields with non-finite lat/lng is 400, nothing created', async () => {
    const res = await request(app)
      .post('/api/fields')
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({
        name: 'FieldsPilotBadLatLng',
        location: 'FieldsPilot BadLatLng Ave',
        type: 'open',
        lat: 'not-a-number',
      });

    expect(res.statusCode).toEqual(400);
    const leaked = await prisma.field.findFirst({ where: { name: 'FieldsPilotBadLatLng' } });
    expect(leaked).toBeNull();
  });

  test('PUT /api/fields/:id updates only the supplied new fields, leaving others untouched', async () => {
    const created = await prisma.field.create({
      data: {
        name: 'FieldsPilotExtrasBeforeUpdate',
        location: 'FieldsPilot Extras Update Ave',
        type: 'OPEN',
        description: 'Original description',
        supportedSports: ['SOCCER'],
        lat: 32.05,
        lng: 34.75,
      },
    });
    createdIds.push(created.id);

    const res = await request(app)
      .put(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ description: 'new description' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.description).toEqual('new description');
    // supportedSports/lat/lng were not in the PUT body — must be unchanged.
    expect(res.body.supportedSports).toEqual(['SOCCER']);
    expect(res.body.lat).toEqual(32.05);
    expect(res.body.lng).toEqual(34.75);
  });

  test('PUT /api/fields/:id with invalid supportedSports is 400 and applies no partial update', async () => {
    const created = await prisma.field.create({
      data: {
        name: 'FieldsPilotExtrasNoPartial',
        location: 'FieldsPilot Extras NoPartial Ave',
        type: 'OPEN',
      },
    });
    createdIds.push(created.id);

    const res = await request(app)
      .put(`/api/fields/${created.id}`)
      .set('Authorization', 'Bearer mock_fields_admin')
      .send({ name: 'ShouldNotApply', supportedSports: ['NOT_A_SPORT'] });

    expect(res.statusCode).toEqual(400);
    const unchanged = await prisma.field.findUnique({ where: { id: created.id } });
    expect(unchanged.name).toEqual('FieldsPilotExtrasNoPartial');
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

  // 1x1 transparent PNG, small enough to inline as a test fixture rather than
  // committing a binary file.
  const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );

  describe('Field image and photo gallery (Admin only)', () => {
    test('POST /api/fields/:id/image then DELETE /api/fields/:id/image round-trips', async () => {
      const created = await prisma.field.create({
        data: { name: 'FieldsPilotImageRoundTrip', location: 'FieldsPilot Image Ave', type: 'OPEN' },
      });
      createdIds.push(created.id);

      const upload = await request(app)
        .post(`/api/fields/${created.id}/image`)
        .set('Authorization', 'Bearer mock_fields_admin')
        .attach('image', TINY_PNG, 'test.png');
      expect(upload.statusCode).toEqual(200);
      expect(upload.body.image).toEqual(expect.stringContaining('/uploads/fields/'));

      const del = await request(app)
        .delete(`/api/fields/${created.id}/image`)
        .set('Authorization', 'Bearer mock_fields_admin');
      expect(del.statusCode).toEqual(200);
      expect(del.body.image).toBeNull();

      const after = await prisma.field.findUnique({ where: { id: created.id } });
      expect(after.image).toBeNull();
    });

    test('DELETE /api/fields/:id/image as non-admin is 403', async () => {
      const created = await prisma.field.create({
        data: { name: 'FieldsPilotImageAuthCheck', location: 'FieldsPilot Image Ave', type: 'OPEN' },
      });
      createdIds.push(created.id);

      const res = await request(app)
        .delete(`/api/fields/${created.id}/image`)
        .set('Authorization', 'Bearer mock_fields_member');
      expect(res.statusCode).toEqual(403);
    });

    test('POST /api/fields/:id/photos appends to the gallery without touching existing photos', async () => {
      const created = await prisma.field.create({
        data: {
          name: 'FieldsPilotPhotosAppend',
          location: 'FieldsPilot Photos Ave',
          type: 'OPEN',
          photos: ['https://example.com/existing.jpg'],
        },
      });
      createdIds.push(created.id);

      const res = await request(app)
        .post(`/api/fields/${created.id}/photos`)
        .set('Authorization', 'Bearer mock_fields_admin')
        .attach('photo', TINY_PNG, 'test.png');
      expect(res.statusCode).toEqual(201);
      expect(res.body.photos).toHaveLength(2);
      expect(res.body.photos[0]).toEqual('https://example.com/existing.jpg');
      expect(res.body.photos[1]).toEqual(expect.stringContaining('/uploads/fields/'));
    });

    test('POST /api/fields/:id/photos with no file is 400', async () => {
      const created = await prisma.field.create({
        data: { name: 'FieldsPilotPhotosNoFile', location: 'FieldsPilot Photos Ave', type: 'OPEN' },
      });
      createdIds.push(created.id);

      const res = await request(app)
        .post(`/api/fields/${created.id}/photos`)
        .set('Authorization', 'Bearer mock_fields_admin');
      expect(res.statusCode).toEqual(400);
    });

    test('DELETE /api/fields/:id/photos removes only the matching URL', async () => {
      const created = await prisma.field.create({
        data: {
          name: 'FieldsPilotPhotosRemove',
          location: 'FieldsPilot Photos Ave',
          type: 'OPEN',
          photos: ['https://example.com/keep.jpg', 'https://example.com/remove.jpg'],
        },
      });
      createdIds.push(created.id);

      const res = await request(app)
        .delete(`/api/fields/${created.id}/photos`)
        .set('Authorization', 'Bearer mock_fields_admin')
        .send({ url: 'https://example.com/remove.jpg' });
      expect(res.statusCode).toEqual(200);
      expect(res.body.photos).toEqual(['https://example.com/keep.jpg']);
    });

    test('DELETE /api/fields/:id/photos without a url is 400', async () => {
      const created = await prisma.field.create({
        data: { name: 'FieldsPilotPhotosNoUrl', location: 'FieldsPilot Photos Ave', type: 'OPEN' },
      });
      createdIds.push(created.id);

      const res = await request(app)
        .delete(`/api/fields/${created.id}/photos`)
        .set('Authorization', 'Bearer mock_fields_admin')
        .send({});
      expect(res.statusCode).toEqual(400);
    });
  });
});
