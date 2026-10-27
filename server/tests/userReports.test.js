const request = require('supertest');

jest.setTimeout(30000);

const mockLimiterCalls = [];
jest.mock('../middleware/rateLimit', () => {
  const actual = jest.requireActual('../middleware/rateLimit');
  return {
    ...actual,
    createRateLimiter: (opts) => {
      mockLimiterCalls.push(opts);
      return actual.createRateLimiter(opts);
    },
  };
});
jest.mock('../utils/auth', () => require('./helpers/userReportsMocks').authMock({
  invalidateClerkUser: jest.fn(),
  clerkClient: { users: { updateUserMetadata: jest.fn() } },
}));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

const IDS = ['ur_reporter', 'ur_target'];
const auth = (t = 'mock_token_reporter') => ({ Authorization: `Bearer ${t}` });
const post = (body, t) => request(app).post('/api/user-reports').set(auth(t)).send(body);

describe('POST /api/user-reports', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await Promise.all(IDS.map((id) => prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } })));
  });
  beforeEach(async () => {
    await prisma.userReport.deleteMany({ where: { reporterId: { in: IDS } } });
    await prisma.userBlock.deleteMany({ where: { blockerId: { in: IDS } } });
  });
  afterAll(async () => {
    await prisma.userReport.deleteMany({ where: { reporterId: { in: IDS } } });
    await prisma.userBlock.deleteMany({ where: { blockerId: { in: IDS } } });
    await prisma.user.deleteMany({ where: { id: { in: IDS } } });
    await prisma.$disconnect();
  });

  test('requires auth', async () => {
    const res = await request(app).post('/api/user-reports').send({ targetId: 'ur_target', reason: 'OTHER' });
    expect(res.statusCode).toBe(401);
  });

  test('creates a report and answers 201 { ok: true }', async () => {
    const res = await post({ targetId: 'ur_target', reason: 'harassment', details: ' rude ' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
    const rows = await prisma.userReport.findMany({ where: { reporterId: 'ur_reporter' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ targetId: 'ur_target', reason: 'HARASSMENT', details: 'rude', status: 'OPEN', gameId: null });
  });

  test('rejects self-report', async () => {
    const res = await post({ targetId: 'ur_reporter', reason: 'OTHER' });
    expect(res.statusCode).toBe(400);
    expect(await prisma.userReport.count({ where: { reporterId: 'ur_reporter' } })).toBe(0);
  });

  test('unknown target is 404', async () => {
    const res = await post({ targetId: 'ur_nobody', reason: 'OTHER' });
    expect(res.statusCode).toBe(404);
  });

  test('validates reason, details and targetId', async () => {
    expect((await post({ targetId: 'ur_target', reason: 'NOPE' })).statusCode).toBe(400);
    expect((await post({ targetId: 'ur_target' })).statusCode).toBe(400);
    expect((await post({ reason: 'OTHER' })).statusCode).toBe(400);
    expect((await post({ targetId: 'ur_target', reason: 'OTHER', details: 'x'.repeat(1001) })).statusCode).toBe(400);
    expect((await post({ targetId: 'ur_target', reason: 'OTHER', details: 5 })).statusCode).toBe(400);
    expect(await prisma.userReport.count({ where: { reporterId: 'ur_reporter' } })).toBe(0);
  });

  test('duplicate open report for same (reporter,target,game) is stored once but answers identically', async () => {
    const first = await post({ targetId: 'ur_target', reason: 'CHEATING' });
    const second = await post({ targetId: 'ur_target', reason: 'CHEATING' });
    expect(second.statusCode).toBe(first.statusCode);
    expect(second.body).toEqual(first.body);
    expect(await prisma.userReport.count({ where: { reporterId: 'ur_reporter', targetId: 'ur_target' } })).toBe(1);
  });

  test('a closed report does not block a new one', async () => {
    await post({ targetId: 'ur_target', reason: 'CHEATING' });
    await prisma.userReport.updateMany({ where: { reporterId: 'ur_reporter' }, data: { status: 'DISMISSED' } });
    await post({ targetId: 'ur_target', reason: 'CHEATING' });
    expect(await prisma.userReport.count({ where: { reporterId: 'ur_reporter', status: 'OPEN' } })).toBe(1);
  });

  test('blocked pairs (either direction) get the identical response', async () => {
    const baseline = await post({ targetId: 'ur_target', reason: 'NO_SHOW' });
    await prisma.userReport.deleteMany({ where: { reporterId: 'ur_reporter' } });

    await prisma.userBlock.create({ data: { blockerId: 'ur_target', blockedId: 'ur_reporter' } });
    const blockedByTarget = await post({ targetId: 'ur_target', reason: 'NO_SHOW' });
    await prisma.userBlock.deleteMany({ where: { blockerId: 'ur_target' } });
    await prisma.userReport.deleteMany({ where: { reporterId: 'ur_reporter' } });

    await prisma.userBlock.create({ data: { blockerId: 'ur_reporter', blockedId: 'ur_target' } });
    const blockedByMe = await post({ targetId: 'ur_target', reason: 'NO_SHOW' });

    for (const r of [blockedByTarget, blockedByMe]) {
      expect(r.statusCode).toBe(baseline.statusCode);
      expect(r.body).toEqual(baseline.body);
    }
    expect(await prisma.userReport.count({ where: { reporterId: 'ur_reporter' } })).toBe(1);
  });

  test('is rate limited to 10 per hour (limiter is disabled under Jest, so assert its config)', () => {
    expect(mockLimiterCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ prefix: 'user-report', max: 10, windowMs: 60 * 60 * 1000 })])
    );
  });

  test('returns 429 when rate limiter triggers on POST /api/user-reports', async () => {
    const express = require('express');
    const { createRateLimiter } = jest.requireActual('../middleware/rateLimit');
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, prefix: 'user-report-429-test', forceEnable: true });
    const testApp = express();
    testApp.use(express.json());
    testApp.use((req, res, next) => {
      req.user = { id: 'ur_reporter' };
      next();
    });
    testApp.post('/api/user-reports', limiter, (_req, res) => res.status(201).json({ ok: true }));

    const r1 = await request(testApp).post('/api/user-reports').send({ targetId: 'ur_target', reason: 'OTHER' });
    expect(r1.statusCode).toBe(201);

    const r2 = await request(testApp).post('/api/user-reports').send({ targetId: 'ur_target', reason: 'OTHER' });
    expect(r2.statusCode).toBe(429);
    expect(r2.body).toEqual({ error: 'Too many requests' });
    expect(r2.headers['retry-after']).toBeDefined();
    expect(r2.headers['x-ratelimit-limit']).toBe('1');
    expect(r2.headers['x-ratelimit-remaining']).toBe('0');
  });
});
