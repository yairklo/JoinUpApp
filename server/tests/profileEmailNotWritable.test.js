process.env.JOINUP_SKIP_DOTENV = '1';
if (!process.env.DATABASE_URL || !process.env.DIRECT_DATABASE_URL) {
  throw new Error('Refusing to run without an explicit DATABASE_URL and DIRECT_DATABASE_URL');
}

const request = require('supertest');

jest.setTimeout(30000);
jest.mock('../utils/auth', () => {
  const userFor = (req) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return null;
    return { id: token, name: token, avatar: null };
  };
  return {
    authenticateToken: (req, res, next) => {
      const user = userFor(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return next();
    },
    attachOptionalUser: (req, _res, next) => {
      const user = userFor(req);
      if (user) req.user = user;
      next();
    },
    invalidateAccountState: jest.fn(),
  };
});
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { prisma } = require('../lib/prisma');

const A = 'pemail_a';
const B = 'pemail_b';
const TAKEN = 'pemail-taken@example.com';
const MINE = 'pemail-mine@example.com';

describe('PUT /api/users/:id does not write email', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { email: { in: [TAKEN, MINE] } } });
    await prisma.user.create({ data: { id: A, name: 'Player A' } });
    await prisma.user.create({ data: { id: B, name: 'Player B', email: TAKEN } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { email: { in: [TAKEN, MINE] } } });
    await prisma.$disconnect();
  });

  test('a profile save ignores email, including one already stored on another user', async () => {
    const res = await request(app).put(`/api/users/${A}`).set('Authorization', `Bearer ${A}`).send({
      name: 'Player A2',
      phone: '0501234567',
      email: TAKEN,
    });
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
    expect(res.body.name).toBe('Player A2');
    expect(res.body.phone).toBe('0501234567');
    expect(res.body.email).toBeNull();

    const [a, b] = await Promise.all([
      prisma.user.findUnique({ where: { id: A } }),
      prisma.user.findUnique({ where: { id: B } }),
    ]);
    expect(a.email).toBeNull();
    expect(a.name).toBe('Player A2');
    expect(b.email).toBe(TAKEN);
  });

  test('sending email: null does not clear an address already on the row', async () => {
    await prisma.user.update({ where: { id: A }, data: { email: MINE } });
    const res = await request(app).put(`/api/users/${A}`).set('Authorization', `Bearer ${A}`).send({
      name: 'Player A3',
      email: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Player A3');
    expect(res.body.email).toBe(MINE);
    expect((await prisma.user.findUnique({ where: { id: A } })).email).toBe(MINE);
  });
});
