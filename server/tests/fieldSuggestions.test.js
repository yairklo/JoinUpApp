const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_admin') {
      req.user = { id: 'user_admin_fs_1', name: 'Admin', isAdmin: true };
    } else if (token === 'mock_token_member') {
      req.user = { id: 'user_member_fs_1', name: 'Member', isAdmin: false };
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

// All DB access is stubbed -- these tests cover validation, auth and the approve/reject state
// machine without depending on the FieldSuggestion table existing in the shared dev DB.
describe('Field suggestions ("הצע מגרש חדש")', () => {
  const spies = [];
  const spy = (obj, method) => {
    const s = jest.spyOn(obj, method);
    spies.push(s);
    return s;
  };

  let fieldCreate;

  beforeEach(() => {
    fieldCreate = spy(prisma.field, 'create').mockImplementation(async ({ data }) => ({ id: 'field_new_1', ...data }));
  });

  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  const member = (r) => r.set('Authorization', 'Bearer mock_token_member');
  const admin = (r) => r.set('Authorization', 'Bearer mock_token_admin');

  describe('POST /api/field-suggestions', () => {
    test('requires auth', async () => {
      const res = await request(app).post('/api/field-suggestions').send({ name: 'x', address: 'y' });
      expect(res.statusCode).toBe(401);
    });

    test('rejects a missing name or address', async () => {
      const create = spy(prisma.fieldSuggestion, 'create');
      const noName = await member(request(app).post('/api/field-suggestions')).send({ address: 'הרצל 1' });
      const noAddress = await member(request(app).post('/api/field-suggestions')).send({ name: 'אולם' });
      expect(noName.statusCode).toBe(400);
      expect(noAddress.statusCode).toBe(400);
      expect(create).not.toHaveBeenCalled();
    });

    test('rejects a non-boolean isPaid', async () => {
      const res = await member(request(app).post('/api/field-suggestions'))
        .send({ name: 'אולם', address: 'הרצל 1', isPaid: 'maybe' });
      expect(res.statusCode).toBe(400);
    });

    test('creates a PENDING suggestion and never creates a Field', async () => {
      const create = spy(prisma.fieldSuggestion, 'create')
        .mockImplementation(async ({ data }) => ({ id: 'sug_1', status: 'PENDING', ...data }));

      const res = await member(request(app).post('/api/field-suggestions')).send({
        name: '  אולם ספורט  ',
        address: 'הרצל 1, תל אביב',
        isPaid: true,
        contactInfo: 'דני 050-0000000',
      });

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: 'sug_1', status: 'PENDING' });
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_member_fs_1',
          name: 'אולם ספורט',
          address: 'הרצל 1, תל אביב',
          isPaid: true,
          contactInfo: 'דני 050-0000000',
        }),
      });
      expect(fieldCreate).not.toHaveBeenCalled();
    });

    test('isPaid omitted is stored as unknown (null)', async () => {
      const create = spy(prisma.fieldSuggestion, 'create')
        .mockImplementation(async ({ data }) => ({ id: 'sug_2', status: 'PENDING', ...data }));
      await member(request(app).post('/api/field-suggestions')).send({ name: 'a', address: 'b' });
      expect(create.mock.calls[0][0].data.isPaid).toBeNull();
    });
  });

  describe('admin endpoints', () => {
    test('non-admins get 403 on list / approve / reject', async () => {
      const list = await member(request(app).get('/api/field-suggestions'));
      const approve = await member(request(app).post('/api/field-suggestions/sug_1/approve'))
        .send({ name: 'a', location: 'b', type: 'open' });
      const reject = await member(request(app).post('/api/field-suggestions/sug_1/reject'));
      expect([list.statusCode, approve.statusCode, reject.statusCode]).toEqual([403, 403, 403]);
      expect(fieldCreate).not.toHaveBeenCalled();
    });

    test('admin lists pending suggestions', async () => {
      const findMany = spy(prisma.fieldSuggestion, 'findMany').mockResolvedValue([{ id: 'sug_1' }]);
      const res = await admin(request(app).get('/api/field-suggestions'));
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ id: 'sug_1' }]);
      expect(findMany.mock.calls[0][0].where).toEqual({ status: 'PENDING' });
    });

    const mockTransaction = (suggestion, updateCount = 1) => {
      const tx = {
        fieldSuggestion: {
          findUnique: jest.fn().mockResolvedValue(suggestion),
          updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
        },
        field: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'field_new_1', ...data })) },
      };
      spy(prisma, '$transaction').mockImplementation(async (fn) => fn(tx));
      return tx;
    };

    test('approve creates an available Field and marks the suggestion APPROVED in one transaction', async () => {
      const tx = mockTransaction({ id: 'sug_1', status: 'PENDING' });
      const res = await admin(request(app).post('/api/field-suggestions/sug_1/approve')).send({
        name: 'אולם ספורט',
        location: 'הרצל 1, תל אביב',
        city: 'תל אביב',
        type: 'closed',
        price: 40,
        lat: 32.06,
        lng: 34.77,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe('field_new_1');
      expect(tx.field.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'אולם ספורט', available: true, type: 'CLOSED', price: 40, lat: 32.06 }),
      });
      expect(tx.fieldSuggestion.updateMany).toHaveBeenCalledWith({
        where: { id: 'sug_1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED', createdFieldId: 'field_new_1' }),
      });
      // Only the transactional client may create the Field.
      expect(fieldCreate).not.toHaveBeenCalled();
    });

    test('approve validates the field payload', async () => {
      const res = await admin(request(app).post('/api/field-suggestions/sug_1/approve')).send({ name: 'a', type: 'open' });
      expect(res.statusCode).toBe(400);
    });

    test('approving an already-resolved suggestion is a 409 and creates nothing', async () => {
      const tx = mockTransaction({ id: 'sug_1', status: 'APPROVED' });
      const res = await admin(request(app).post('/api/field-suggestions/sug_1/approve'))
        .send({ name: 'a', location: 'b', type: 'open' });
      expect(res.statusCode).toBe(409);
      expect(tx.field.create).not.toHaveBeenCalled();
    });

    test('approve of an unknown id is a 404', async () => {
      mockTransaction(null);
      const res = await admin(request(app).post('/api/field-suggestions/nope/approve'))
        .send({ name: 'a', location: 'b', type: 'open' });
      expect(res.statusCode).toBe(404);
    });

    test('a concurrent approve that loses the race is a 409 (transaction rolled back)', async () => {
      mockTransaction({ id: 'sug_1', status: 'PENDING' }, 0);
      const res = await admin(request(app).post('/api/field-suggestions/sug_1/approve'))
        .send({ name: 'a', location: 'b', type: 'open' });
      expect(res.statusCode).toBe(409);
    });

    test('reject marks a pending suggestion REJECTED without creating a Field', async () => {
      const updateMany = spy(prisma.fieldSuggestion, 'updateMany').mockResolvedValue({ count: 1 });
      const res = await admin(request(app).post('/api/field-suggestions/sug_1/reject')).send({ adminNote: 'כפילות' });
      expect(res.statusCode).toBe(200);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'sug_1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'REJECTED', adminNote: 'כפילות' }),
      });
      expect(fieldCreate).not.toHaveBeenCalled();
    });

    test('reject of an already-resolved suggestion is a 409, unknown id a 404', async () => {
      spy(prisma.fieldSuggestion, 'updateMany').mockResolvedValue({ count: 0 });
      const findUnique = spy(prisma.fieldSuggestion, 'findUnique').mockResolvedValueOnce({ id: 'sug_1' }).mockResolvedValueOnce(null);
      const resolved = await admin(request(app).post('/api/field-suggestions/sug_1/reject'));
      const missing = await admin(request(app).post('/api/field-suggestions/nope/reject'));
      expect(resolved.statusCode).toBe(409);
      expect(missing.statusCode).toBe(404);
      expect(findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
