const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token !== 'mock_parking_admin') return res.status(401).json({ error: 'No token provided' });
    req.user = { id: 'user_parking_admin', name: 'ParkingAdmin', isAdmin: true };
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

// All DB access is stubbed -- these cover the parking rules on admin Field create/update without
// depending on the parking columns existing in the shared dev DB.
describe('Field parking on POST/PUT /api/fields', () => {
  const FIELD_ID = 'field_parking_1';
  const STORED = {
    id: FIELD_ID, name: 'ParkingField', location: 'Parking Ave', type: 'OPEN',
    parkingLat: 32.07, parkingLng: 34.78, parkingNote: 'behind the hall',
  };
  const spies = [];
  const spy = (obj, method) => {
    const s = jest.spyOn(obj, method);
    spies.push(s);
    return s;
  };
  let update;
  let create;

  beforeEach(() => {
    update = spy(prisma.field, 'update').mockImplementation(async ({ data }) => ({ ...STORED, ...data }));
    create = spy(prisma.field, 'create').mockImplementation(async ({ data }) => ({ id: FIELD_ID, ...data }));  });

  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  const put = (body) => request(app)
    .put(`/api/fields/${FIELD_ID}`)
    .set('Authorization', 'Bearer mock_parking_admin')
    .send(body);
  const post = (body) => request(app)
    .post('/api/fields')
    .set('Authorization', 'Bearer mock_parking_admin')
    .send({ name: 'ParkingField', location: 'Parking Ave', type: 'open', ...body });

  test('PUT clears the parking pin and its note when the admin removes it', async () => {
    const res = await put({ parkingLat: null, parkingLng: null, parkingNote: null });

    expect(res.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ parkingLat: null, parkingLng: null, parkingNote: null });
    expect(res.body).toEqual(expect.objectContaining({ parkingLat: null, parkingLng: null, parkingNote: null }));
  });

  test('PUT clearing the pin leaves the note alone', async () => {
    const omitted = await put({ parkingLat: null, parkingLng: null });
    await put({ parkingLat: '', parkingLng: '', parkingNote: 'still here' });

    // No parkingNote key at all, so the stored note is not touched.
    expect(update.mock.calls[0][0].data).toEqual({ parkingLat: null, parkingLng: null });
    expect(omitted.body).toEqual(expect.objectContaining({
      parkingLat: null, parkingLng: null, parkingNote: 'behind the hall',
    }));
    expect(update.mock.calls[1][0].data).toEqual({ parkingLat: null, parkingLng: null, parkingNote: 'still here' });
  });

  test('PUT clearing the note (null or empty) leaves the pin alone', async () => {
    const res = await put({ parkingNote: null });
    await put({ parkingNote: '   ' });

    expect(update.mock.calls[0][0].data).toEqual({ parkingNote: null });
    expect(update.mock.calls[1][0].data).toEqual({ parkingNote: null });
    expect(res.body).toEqual(expect.objectContaining({ parkingLat: 32.07, parkingLng: 34.78, parkingNote: null }));
  });

  test('PUT without any parking fields leaves the existing parking untouched', async () => {
    const res = await put({ name: 'ParkingFieldRenamed' });

    expect(res.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ name: 'ParkingFieldRenamed' });
    expect(res.body).toEqual(expect.objectContaining({
      name: 'ParkingFieldRenamed', parkingLat: 32.07, parkingLng: 34.78, parkingNote: 'behind the hall',
    }));
  });

  test('PUT with only a note saves it, whether or not the field has a pin', async () => {
    const res = await put({ parkingNote: '  enter from <b>Herzl</b> St  ' });
    expect(res.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ parkingNote: 'enter from Herzl St' });

    update.mockImplementation(async ({ data }) => ({ ...STORED, parkingLat: null, parkingLng: null, ...data }));
    const noPin = await put({ parkingNote: 'enter from Herzl St' });
    expect(noPin.statusCode).toBe(200);
    expect(noPin.body).toEqual(expect.objectContaining({
      parkingLat: null, parkingLng: null, parkingNote: 'enter from Herzl St',
    }));
  });

  test('POST saves a note on its own, without a pin', async () => {
    const noteOnly = await post({ parkingNote: 'behind the hall' });
    expect(noteOnly.statusCode).toBe(201);
    expect(create.mock.calls[0][0].data.parkingNote).toBe('behind the hall');
    expect(create.mock.calls[0][0].data).not.toHaveProperty('parkingLat');

    // What the web form sends for a note-only field: an explicit empty pin next to the note.
    const emptyPin = await post({ parkingLat: null, parkingLng: null, parkingNote: 'behind the hall' });
    expect(emptyPin.statusCode).toBe(201);
    expect(create.mock.calls[1][0].data).toEqual(expect.objectContaining({
      parkingLat: null, parkingLng: null, parkingNote: 'behind the hall',
    }));
  });

  test('rejects half a pin and caps the note at 140 characters', async () => {
    const half = [
      { parkingLat: 32.07 },
      { parkingLng: 34.78 },
      { parkingLat: 32.07, parkingLng: null },
      { parkingLat: '', parkingLng: 34.78 },
    ];
    for (const body of half) {
      expect((await put(body)).statusCode).toBe(400);
      expect((await post(body)).statusCode).toBe(400);
    }
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    await put({ parkingNote: 'x'.repeat(300) });
    expect(update.mock.calls[0][0].data.parkingNote).toHaveLength(140);
  });

  test('rejects coordinates that only look valid after Number() coercion', async () => {
    const bad = [
      { parkingLat: ' ', parkingLng: ' ' },
      { parkingLat: '  ', parkingLng: 34.78 },
      { parkingLat: true, parkingLng: true },
      { parkingLat: false, parkingLng: 34.78 },
      { parkingLat: [32.07], parkingLng: [34.78] },
      { parkingLat: {}, parkingLng: 34.78 },
      { parkingLat: 'abc', parkingLng: 34.78 },
      { parkingLat: 90.01, parkingLng: 34.78 },
      { parkingLat: 32.07, parkingLng: -180.01 },
    ];
    for (const body of bad) {
      expect((await put(body)).statusCode).toBe(400);
      expect((await post(body)).statusCode).toBe(400);
    }
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    const ok = await put({ parkingLat: '32.07', parkingLng: -180 });
    expect(ok.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ parkingLat: 32.07, parkingLng: -180 });
  });
});
