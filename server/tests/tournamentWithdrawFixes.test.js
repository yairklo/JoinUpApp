const request = require('supertest');

jest.setTimeout(180000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { prisma, ensureUsers, tournamentBody, cleanup, seedTeams } = require('./helpers/tournamentFixtures');
const results = require('../services/tournamentResultService');
const { REMINDER_KEY } = require('../services/tournamentScheduleService');

const P = 'twf_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);

async function setup(over, teamCount) {
  const res = await as('post', '/api/tournaments', ORG).send(tournamentBody({ maxTeams: 32, ...over }));
  expect(res.status).toBe(201);
  const id = res.body.id;
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: MGR, role: 'MANAGER' });
  const teams = await seedTeams(P, id, teamCount);
  await prisma.tournament.update({ where: { id }, data: { status: 'REGISTRATION_CLOSED' } });
  expect((await as('post', `/api/tournaments/${id}/schedule/generate`, MGR).send({})).status).toBe(200);
  await prisma.tournament.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  return { id, teams };
}

describe('rankTable manualRank semantics (pure)', () => {
  const t = { id: 't1', rules: { tiebreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'] } };
  const team = (id, manualRank = null) => ({ id, manualRank, status: 'APPROVED' });
  // a beats b beats c beats d (strict order a, b, c, d)
  const ms = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']].map(([h, a]) => ({
    homeTeamId: h, awayTeamId: a, homeScore: 1, awayScore: 0, status: 'FINISHED', winnerTeamId: h,
  }));
  const order = (rows) => rows.map((r) => r.teamId);

  it('without pins follows the computed order', () => {
    expect(order(results.rankTable(t, ['a', 'b', 'c', 'd'].map((x) => team(x)), ms))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a pin places the team at that position; the rest fill the other positions in computed order', () => {
    const rows = results.rankTable(t, [team('a'), team('b'), team('c'), team('d', 1)], ms);
    expect(order(rows)).toEqual(['d', 'a', 'b', 'c']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    const rows2 = results.rankTable(t, [team('a', 4), team('b'), team('c'), team('d')], ms);
    expect(order(rows2)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('a pin that equals a computed position of another team does not collide', () => {
    // b pinned at 1 while a is computed 1st: a moves to 2nd, nobody is dropped or duplicated
    const rows = results.rankTable(t, [team('a'), team('b', 1), team('c'), team('d')], ms);
    expect(order(rows)).toEqual(['b', 'a', 'c', 'd']);
    expect(new Set(order(rows)).size).toBe(4);
  });

  it('two pins on the same position: better computed rank keeps it, the other takes the next free one', () => {
    const rows = results.rankTable(t, [team('a'), team('b', 2), team('c', 2), team('d')], ms);
    expect(order(rows)).toEqual(['a', 'b', 'c', 'd']);
    const rows2 = results.rankTable(t, [team('a'), team('b'), team('c', 4), team('d', 4)], ms);
    expect(order(rows2)).toEqual(['a', 'b', 'd', 'c']);
    const rows3 = results.rankTable(t, [team('a', 1), team('b', 1), team('c'), team('d')], ms);
    expect(order(rows3)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a pin beyond the table size is clamped to the last position', () => {
    const rows = results.rankTable(t, [team('a', 99), team('b'), team('c'), team('d')], ms);
    expect(order(rows)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('pins resolve ties: unresolved is cleared only for the pinned team', () => {
    const drawn = [{ homeTeamId: 'x', awayTeamId: 'y', homeScore: 1, awayScore: 1, status: 'FINISHED', winnerTeamId: null }];
    const open = results.rankTable(t, [team('x'), team('y')], drawn);
    expect(open.every((r) => r.unresolved)).toBe(true);
    const pinned = results.rankTable(t, [team('x'), team('y', 1)], drawn);
    expect(order(pinned)).toEqual(['y', 'x']);
    expect(pinned.find((r) => r.teamId === 'y').unresolved).toBe(false);
  });
});

describe('withdrawn teams, atomic withdraw + forfeit', () => {
  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    await ensureUsers([ORG, MGR]);
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('standings keep a withdrawn team so its forfeited opponents get points; rows are marked withdrawn', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const res = await as('delete', `/api/tournaments/${id}/teams/${teams[0].id}`, MGR);
    expect(res.status).toBe(200);
    expect(res.body.affectedMatchIds).toHaveLength(2);
    const st = (await request(app).get(`/api/tournaments/${id}/standings`)).body;
    const rows = st.tables[0].rows;
    expect(rows).toHaveLength(3);
    const byName = Object.fromEntries(rows.map((r) => [r.team.id, r]));
    expect(byName[teams[0].id]).toMatchObject({ withdrawn: true, played: 2, won: 0, lost: 2, points: 0 });
    for (const o of [teams[1], teams[2]]) {
      expect(byName[o.id]).toMatchObject({ withdrawn: false, played: 1, won: 1, points: 3 });
    }
  });

  it('a withdrawn team without any match is not listed', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    const extra = await prisma.tournamentTeam.create({
      data: { tournamentId: id, name: 'Late Withdrawn', captainId: ORG, status: 'WITHDRAWN', joinCode: `${id.slice(-6)}-late` },
    });
    const rows = (await request(app).get(`/api/tournaments/${id}/standings`)).body.tables[0].rows;
    expect(rows.map((r) => r.team.id)).not.toContain(extra.id);
  });

  it('forfeit clears stale details (keeping the reminder sentinel), penalties and player stats', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const m = await prisma.tournamentMatch.findFirst({ where: { tournamentId: id, OR: [{ homeTeamId: teams[0].id }, { awayTeamId: teams[0].id }] }, orderBy: { number: 'asc' } });
    await prisma.tournamentMatch.update({
      where: { id: m.id },
      data: { status: 'LIVE', homePenalties: 4, awayPenalties: 3, details: { sets: [[6, 0]], [REMINDER_KEY]: '2026-01-01T00:00:00.000Z' } },
    });
    await prisma.playerStatEntry.create({ data: { tournamentMatchId: m.id, userId: teams[0].playerIds[0], key: 'goals', value: 2 } });
    expect((await as('delete', `/api/tournaments/${id}/teams/${teams[0].id}`, MGR)).status).toBe(200);
    const after = await prisma.tournamentMatch.findUnique({ where: { id: m.id } });
    expect(after.status).toBe('FORFEIT');
    expect(after.homePenalties).toBeNull();
    expect(after.awayPenalties).toBeNull();
    expect(after.details).toEqual({ [REMINDER_KEY]: '2026-01-01T00:00:00.000Z' });
    expect(await prisma.playerStatEntry.count({ where: { tournamentMatchId: m.id } })).toBe(0);
  });

  it('forfeit without a sentinel leaves details null', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const m = await prisma.tournamentMatch.findFirst({ where: { tournamentId: id, OR: [{ homeTeamId: teams[0].id }, { awayTeamId: teams[0].id }] } });
    await prisma.tournamentMatch.update({ where: { id: m.id }, data: { details: { sets: [[6, 0]] } } });
    await as('delete', `/api/tournaments/${id}/teams/${teams[0].id}`, MGR);
    expect((await prisma.tournamentMatch.findUnique({ where: { id: m.id } })).details).toBeNull();
  });

  it('withdraw and forfeit are one transaction: a failing forfeit rolls the withdrawal back', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const spy = jest.spyOn(results, 'forfeitTeamMatchesTx').mockRejectedValueOnce(new Error('boom'));
    const res = await as('delete', `/api/tournaments/${id}/teams/${teams[0].id}`, MGR);
    spy.mockRestore();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect((await prisma.tournamentTeam.findUnique({ where: { id: teams[0].id } })).status).toBe('APPROVED');
    const live = await prisma.tournamentMatch.count({
      where: { tournamentId: id, status: 'SCHEDULED', OR: [{ homeTeamId: teams[0].id }, { awayTeamId: teams[0].id }] },
    });
    expect(live).toBe(2);
  });

  it('GET /teams returns the same shape as before (members, memberCount, isMine, joinCode only for managers)', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const mgr = (await as('get', `/api/tournaments/${id}/teams`, MGR)).body;
    expect(mgr.teams).toHaveLength(3);
    expect(mgr.teams[0]).toMatchObject({ id: teams[0].id, memberCount: 2, isMine: false });
    expect(mgr.teams[0].joinCode).toBeTruthy();
    expect(mgr.teams[0].members).toHaveLength(2);
    expect(mgr.teams[0].members[0]).toHaveProperty('name');
    const pub = (await request(app).get(`/api/tournaments/${id}/teams`)).body;
    expect(pub.teams).toHaveLength(3);
    expect(pub.teams[0]).not.toHaveProperty('joinCode');
  });
});
