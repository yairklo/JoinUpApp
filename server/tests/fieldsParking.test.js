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
  let findUnique;

  beforeEach(() => {
    update = spy(prisma.field, 'update').mockImplementation(async ({ data }) => ({ ...STORED, ...data }));
    create = spy(prisma.field, 'create').mockImplementation(async ({ data }) => ({ id: FIELD_ID, ...data }));
    findUnique = spy(prisma.field, 'findUnique').mockResolvedValue(STORED);
  });

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

  test('PUT clearing the pin drops the note even when the note is omitted or still sent', async () => {
    await put({ parkingLat: null, parkingLng: null });
    await put({ parkingLat: '', parkingLng: '', parkingNote: 'leftover note' });

    expect(update).toHaveBeenCalledTimes(2);
    for (const call of update.mock.calls) {
      expect(call[0].data).toEqual({ parkingLat: null, parkingLng: null, parkingNote: null });
    }
  });

  test('PUT without any parking fields leaves the existing parking untouched', async () => {
    const res = await put({ name: 'ParkingFieldRenamed' });

    expect(res.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ name: 'ParkingFieldRenamed' });
    expect(res.body).toEqual(expect.objectContaining({
      name: 'ParkingFieldRenamed', parkingLat: 32.07, parkingLng: 34.78, parkingNote: 'behind the hall',
    }));
  });

  test('PUT with only a note needs a pin already on the field', async () => {
    const withPin = await put({ parkingNote: 'enter from Herzl St' });
    expect(withPin.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ parkingNote: 'enter from Herzl St' });

    findUnique.mockResolvedValue({ ...STORED, parkingLat: null, parkingLng: null });
    const withoutPin = await put({ parkingNote: 'enter from Herzl St' });
    expect(withoutPin.statusCode).toBe(400);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('POST never saves a note without a pin', async () => {
    const noteOnly = await post({ parkingNote: 'behind the hall' });
    expect(noteOnly.statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();

    const cleared = await post({ parkingLat: null, parkingLng: null, parkingNote: 'behind the hall' });
    expect(cleared.statusCode).toBe(201);
    expect(create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      parkingLat: null, parkingLng: null, parkingNote: null,
    }));
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
