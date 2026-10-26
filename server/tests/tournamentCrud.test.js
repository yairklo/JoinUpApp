const request = require('supertest');

jest.setTimeout(60000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { prisma, ensureUsers, tournamentBody, cleanup } = require('./helpers/tournamentFixtures');

const P = 'tcrud_';
const ADMIN = `${P}admin`;
const CREATOR = `${P}creator`;
const MGR = `${P}mgr`;
const SCORER = `${P}scorer`;
const PLAIN = `${P}plain`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;

const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);

describe('tournaments CRUD, state machine, roles, visibility', () => {
  let t;

  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = CREATOR;
    await cleanup(P);
    await ensureUsers([ADMIN, CREATOR, MGR, SCORER, PLAIN]);
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('gates creation: stranger 403, allowlisted and admin ok, anonymous 401', async () => {
    expect((await request(app).post('/api/tournaments').send(tournamentBody())).status).toBe(401);
    expect((await as('post', '/api/tournaments', PLAIN).send(tournamentBody())).status).toBe(403);
    const res = await as('post', '/api/tournaments', CREATOR).send(tournamentBody());
    expect(res.status).toBe(201);
    t = res.body;
    expect(t.status).toBe('DRAFT');
    expect(t.myRole).toBe('ORGANIZER');
    expect(t.rules.points).toEqual({ win: 3, draw: 1, loss: 0 });
    expect((await as('post', '/api/tournaments', `${ADMIN}:admin`).send(tournamentBody({ title: 'Admin cup' }))).status).toBe(201);
  });

  it('creates organizer role and chat room in the same transaction', async () => {
    const role = await prisma.tournamentRole.findFirst({ where: { tournamentId: t.id, userId: CREATOR } });
    expect(role.role).toBe('ORGANIZER');
    const room = await prisma.chatRoom.findUnique({ where: { id: t.id }, include: { participants: true } });
    expect(room.participants.map((p) => p.userId)).toEqual([CREATOR]);
  });

  it('validates limits', async () => {
    const post = (over) => as('post', '/api/tournaments', CREATOR).send(tournamentBody(over));
    expect((await post({ minPlayersPerTeam: 5, maxPlayersPerTeam: 3 })).status).toBe(400);
    expect((await post({ startersPerTeam: 5, minPlayersPerTeam: 3 })).status).toBe(400);
    expect((await post({ minTeams: 5, maxTeams: 4 })).status).toBe(400);
    expect((await post({ sport: 'CHESS' })).status).toBe(400);
    expect((await post({ title: '' })).status).toBe(400);
    expect((await post({ rules: { tiebreak: ['NOPE'] } })).status).toBe(400);
  });

  it('hides DRAFT from non-roles (detail 404, list excludes) but shows to roles', async () => {
    expect((await as('get', `/api/tournaments/${t.id}`, PLAIN)).status).toBe(404);
    expect((await request(app).get(`/api/tournaments/${t.id}`)).status).toBe(404);
    const list = await as('get', '/api/tournaments', PLAIN);
    expect(list.body.map((x) => x.id)).not.toContain(t.id);
    expect((await as('get', `/api/tournaments/${t.id}`, CREATOR)).status).toBe(200);
    const mine = await as('get', '/api/tournaments', CREATOR);
    expect(mine.body.map((x) => x.id)).toContain(t.id);
  });

  it('organizer manages roles; manager cannot; scorekeeper limited', async () => {
    expect((await as('post', `/api/tournaments/${t.id}/roles`, PLAIN).send({ userId: MGR, role: 'MANAGER' })).status).toBe(404);
    expect((await as('post', `/api/tournaments/${t.id}/roles`, CREATOR).send({ userId: MGR, role: 'MANAGER' })).status).toBe(200);
    expect((await as('post', `/api/tournaments/${t.id}/roles`, CREATOR).send({ userId: SCORER, role: 'SCOREKEEPER' })).status).toBe(200);
    expect((await as('post', `/api/tournaments/${t.id}/roles`, MGR).send({ userId: PLAIN, role: 'MANAGER' })).status).toBe(403);
    expect((await as('post', `/api/tournaments/${t.id}/roles`, CREATOR).send({ userId: CREATOR, role: 'MANAGER' })).status).toBe(400);
    expect((await as('post', `/api/tournaments/${t.id}/roles`, CREATOR).send({ userId: PLAIN, role: 'ORGANIZER' })).status).toBe(400);
    expect((await as('get', `/api/tournaments/${t.id}`, SCORER)).body.capabilities.canScore).toBe(true);
    expect((await as('patch', `/api/tournaments/${t.id}`, SCORER).send({ title: 'x' })).status).toBe(403);
    const patched = await as('patch', `/api/tournaments/${t.id}`, MGR).send({ title: 'Renamed Cup' });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe('Renamed Cup');
    const roles = await as('get', `/api/tournaments/${t.id}/roles`, MGR);
    expect(roles.body.map((r) => r.role).sort()).toEqual(['MANAGER', 'ORGANIZER', 'SCOREKEEPER']);
  });

  it('removes a role (organizer only, never the organizer)', async () => {
    expect((await as('delete', `/api/tournaments/${t.id}/roles/${SCORER}`, MGR)).status).toBe(403);
    expect((await as('delete', `/api/tournaments/${t.id}/roles/${CREATOR}`, CREATOR)).status).toBe(400);
    expect((await as('delete', `/api/tournaments/${t.id}/roles/${SCORER}`, CREATOR)).status).toBe(200);
    expect((await as('delete', `/api/tournaments/${t.id}/roles/${SCORER}`, CREATOR)).status).toBe(404);
  });

  it('enforces the status state machine', async () => {
    const st = (to, user = MGR, extra = {}) => as('post', `/api/tournaments/${t.id}/status`, user).send({ status: to, ...extra });
    expect((await st('IN_PROGRESS')).status).toBe(409);
    expect((await st('BOGUS')).status).toBe(400);
    expect((await st('REGISTRATION_OPEN', PLAIN)).status).toBe(404);
    const open = await st('REGISTRATION_OPEN');
    expect(open.status).toBe(200);
    expect(open.body.previousStatus).toBe('DRAFT');
    expect((await st('DRAFT')).status).toBe(409);
    expect((await st('REGISTRATION_CLOSED')).status).toBe(200);
    expect((await st('REGISTRATION_OPEN')).status).toBe(200);
    expect((await st('REGISTRATION_CLOSED')).status).toBe(200);
    const start = await st('IN_PROGRESS');
    expect(start.status).toBe(409);
    expect(start.body.code).toBe('CANNOT_START');
    expect(start.body.problems.map((p) => p.code)).toEqual(expect.arrayContaining(['TOO_FEW_TEAMS', 'NO_SCHEDULE']));
  });

  it('is visible to the public once published', async () => {
    const detail = await request(app).get(`/api/tournaments/${t.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.myRole).toBeNull();
    expect(detail.body.capabilities.canManage).toBe(false);
    expect(detail.body.counts.teamsPending).toBeUndefined();
    const list = await request(app).get('/api/tournaments?status=REGISTRATION_CLOSED&sport=SOCCER');
    expect(list.body.map((x) => x.id)).toContain(t.id);
    expect((await request(app).get('/api/tournaments?sport=CHESS')).status).toBe(400);
  });

  it('locks structural fields once the schedule exists unless the organizer forces', async () => {
    const t2 = (await as('post', '/api/tournaments', CREATOR).send(tournamentBody({ title: 'Lock cup' }))).body;
    await as('post', `/api/tournaments/${t2.id}/roles`, CREATOR).send({ userId: MGR, role: 'MANAGER' });
    const stage = await prisma.tournamentStage.create({ data: { tournamentId: t2.id, order: 0, type: 'LEAGUE', name: 'L', config: {} } });
    await prisma.tournamentMatch.create({ data: { tournamentId: t2.id, stageId: stage.id, round: 1, number: 1 } });
    const patch = (body, user = CREATOR) => as('patch', `/api/tournaments/${t2.id}`, user).send(body);
    expect((await patch({ maxTeams: 8 })).status).toBe(409);
    expect((await patch({ title: 'ok still' })).status).toBe(200);
    expect((await patch({ maxTeams: 8, force: true }, MGR)).status).toBe(409);
    expect((await patch({ maxTeams: 8, force: true })).status).toBe(200);
  });

  it('cancels and then rejects further edits', async () => {
    const res = await as('post', `/api/tournaments/${t.id}/status`, CREATOR).send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect((await as('patch', `/api/tournaments/${t.id}`, CREATOR).send({ title: 'late' })).status).toBe(409);
    expect((await as('post', `/api/tournaments/${t.id}/status`, CREATOR).send({ status: 'REGISTRATION_OPEN' })).status).toBe(409);
  });
});
