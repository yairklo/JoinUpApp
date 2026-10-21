const request = require('supertest');

jest.setTimeout(30000);

const mockUpdateUserMetadata = jest.fn().mockResolvedValue({});
const mockInvalidateClerkUser = jest.fn();
jest.mock('../utils/auth', () => require('./helpers/userReportsMocks').authMock({
  invalidateClerkUser: (...a) => mockInvalidateClerkUser(...a),
  clerkClient: { users: { updateUserMetadata: (...a) => mockUpdateUserMetadata(...a) } },
}));
jest.mock('../workers/gameReminderWorker', () => ({ startGameReminderWorker: jest.fn() }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

const IDS = ['ur_reporter', 'ur_target', 'ur_admin'];
const as = (t) => ({ Authorization: `Bearer ${t}` });
const ADMIN = 'mock_token_admin';
const USER = 'mock_token_reporter';

async function makeReport(extra = {}) {
  return prisma.userReport.create({
    data: { reporterId: 'ur_reporter', targetId: 'ur_target', reason: 'HARASSMENT', details: 'd', ...extra },
  });
}

describe('Admin user reports', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await Promise.all(IDS.map((id) => prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } })));
  });
  beforeEach(async () => {
    await prisma.userReport.deleteMany({ where: { reporterId: 'ur_reporter' } });
    mockUpdateUserMetadata.mockClear();
    mockInvalidateClerkUser.mockClear();
  });
  afterAll(async () => {
    await prisma.userReport.deleteMany({ where: { reporterId: 'ur_reporter' } });
    await prisma.user.deleteMany({ where: { id: { in: IDS } } });
    await prisma.$disconnect();
  });

  test('non-admin gets 403 on every endpoint', async () => {
    const r = await makeReport();
    expect((await request(app).get('/api/admin/user-reports').set(as(USER))).statusCode).toBe(403);
    expect((await request(app).post(`/api/admin/user-reports/${r.id}/resolve`).set(as(USER)).send({ resolution: 'x' })).statusCode).toBe(403);
    expect((await request(app).post(`/api/admin/user-reports/${r.id}/dismiss`).set(as(USER))).statusCode).toBe(403);
    expect((await prisma.userReport.findUnique({ where: { id: r.id } })).status).toBe('OPEN');
  });

  test('lists OPEN by default with names, filters by status, rejects bad status', async () => {
    const open = await makeReport();
    await makeReport({ status: 'DISMISSED' });
    const res = await request(app).get('/api/admin/user-reports').set(as(ADMIN));
    expect(res.statusCode).toBe(200);
    const row = res.body.find((x) => x.id === open.id);
    expect(row).toMatchObject({
      reason: 'HARASSMENT',
      status: 'OPEN',
      reporter: { id: 'ur_reporter', name: 'ur_reporter' },
      target: { id: 'ur_target', name: 'ur_target' },
      game: null,
    });
    expect(res.body.every((x) => x.status === 'OPEN')).toBe(true);
    const dismissed = await request(app).get('/api/admin/user-reports?status=dismissed').set(as(ADMIN));
    expect(dismissed.body.some((x) => x.status === 'DISMISSED')).toBe(true);
    expect((await request(app).get('/api/admin/user-reports?status=zzz').set(as(ADMIN))).statusCode).toBe(400);
  });

  test('resolve with action NONE closes the report without banning', async () => {
    const r = await makeReport();
    const res = await request(app).post(`/api/admin/user-reports/${r.id}/resolve`).set(as(ADMIN)).send({ resolution: 'warned' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'NONE' });
    expect(await prisma.userReport.findUnique({ where: { id: r.id } })).toMatchObject({
      status: 'RESOLVED', resolution: 'warned', resolvedById: 'ur_admin',
    });
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('resolve with action BAN bans the target through the shared ban logic', async () => {
    const r = await makeReport();
    const res = await request(app).post(`/api/admin/user-reports/${r.id}/resolve`).set(as(ADMIN)).send({ resolution: 'repeat offender', action: 'ban' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, action: 'BAN' });
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith(
      'ur_target',
      expect.objectContaining({ privateMetadata: expect.objectContaining({ isBanned: true, banReason: 'repeat offender', bannedBy: 'ur_admin' }) })
    );
    expect(mockInvalidateClerkUser).toHaveBeenCalledWith('ur_target');
    expect((await prisma.userReport.findUnique({ where: { id: r.id } })).status).toBe('RESOLVED');
  });

  test('resolve validates input and cannot ban the admin themself', async () => {
    const r = await makeReport();
    const url = `/api/admin/user-reports/${r.id}/resolve`;
    expect((await request(app).post(url).set(as(ADMIN)).send({})).statusCode).toBe(400);
    expect((await request(app).post(url).set(as(ADMIN)).send({ resolution: 'x', action: 'DELETE' })).statusCode).toBe(400);
    const own = await makeReport({ targetId: 'ur_admin' });
    const res = await request(app).post(`/api/admin/user-reports/${own.id}/resolve`).set(as(ADMIN)).send({ resolution: 'x', action: 'BAN' });
    expect(res.statusCode).toBe(400);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
    expect((await prisma.userReport.findUnique({ where: { id: own.id } })).status).toBe('OPEN');
  });

  test('dismiss closes the report, no ban', async () => {
    const r = await makeReport();
    const res = await request(app).post(`/api/admin/user-reports/${r.id}/dismiss`).set(as(ADMIN));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await prisma.userReport.findUnique({ where: { id: r.id } })).toMatchObject({ status: 'DISMISSED', resolvedById: 'ur_admin' });
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('404 for unknown id and 409 for an already closed report', async () => {
    expect((await request(app).post('/api/admin/user-reports/nope/dismiss').set(as(ADMIN))).statusCode).toBe(404);
    expect((await request(app).post('/api/admin/user-reports/nope/resolve').set(as(ADMIN)).send({ resolution: 'x' })).statusCode).toBe(404);
    const r = await makeReport({ status: 'DISMISSED' });
    expect((await request(app).post(`/api/admin/user-reports/${r.id}/dismiss`).set(as(ADMIN))).statusCode).toBe(409);
    const res = await request(app).post(`/api/admin/user-reports/${r.id}/resolve`).set(as(ADMIN)).send({ resolution: 'x', action: 'BAN' });
    expect(res.statusCode).toBe(409);
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  test('list includes game context when the report has a gameId', async () => {
    const field = await prisma.field.create({ data: { name: 'UR Field', location: 'x', type: 'OPEN' } });
    const game = await prisma.game.create({ data: { fieldId: field.id, start: new Date(), maxPlayers: 10, organizerId: 'ur_reporter' } });
    try {
      const r = await makeReport({ gameId: game.id });
      const res = await request(app).get('/api/admin/user-reports').set(as(ADMIN));
      const row = res.body.find((x) => x.id === r.id);
      expect(row.game).toMatchObject({ id: game.id, field: { name: 'UR Field' } });
    } finally {
      await prisma.userReport.deleteMany({ where: { gameId: game.id } });
      await prisma.game.delete({ where: { id: game.id } });
      await prisma.field.delete({ where: { id: field.id } });
    }
  });
});
