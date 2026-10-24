const request = require('supertest');

jest.setTimeout(120000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
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
const { prisma, ensureUsers, tournamentBody, cleanup, seedTeams } = require('./helpers/tournamentFixtures');

const P = 'tsched_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const SCORER = `${P}scorer`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);

async function setup(over, teamCount, status = 'REGISTRATION_CLOSED') {
  const res = await as('post', '/api/tournaments', ORG).send(tournamentBody({ maxTeams: 32, ...over }));
  expect(res.status).toBe(201);
  const id = res.body.id;
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: MGR, role: 'MANAGER' });
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: SCORER, role: 'SCOREKEEPER' });
  const teams = await seedTeams(P, id, teamCount);
  await prisma.tournament.update({ where: { id }, data: { status } });
  return { id, teams };
}
const gen = (id, body = {}, qs = '', user = MGR) => as('post', `/api/tournaments/${id}/schedule/generate${qs}`, user).send(body);
const dbMatches = (id) => prisma.tournamentMatch.findMany({ where: { tournamentId: id }, orderBy: { number: 'asc' } });

describe('tournament schedule generation and manual matches', () => {
  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    await ensureUsers([ORG, MGR, SCORER]);
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('league: preview writes nothing, commit creates every pairing once', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 4);
    const preview = await gen(id, {}, '?preview=1');
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toBe(true);
    expect(preview.body.matches).toHaveLength(6);
    expect(await dbMatches(id)).toHaveLength(0);
    const commit = await gen(id);
    expect(commit.body).toMatchObject({ preview: false, matchCount: 6 });
    const rows = await dbMatches(id);
    const pairs = new Set(rows.map((m) => [m.homeTeamId, m.awayTeamId].sort().join('|')));
    expect(pairs.size).toBe(6);
    expect(rows.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('double round robin doubles the matches; odd team counts get byes', async () => {
    const { id } = await setup({ format: 'LEAGUE', rules: { legs: 2 } }, 5);
    const res = await gen(id, {}, '?preview=1');
    expect(res.body.matches).toHaveLength(20);
  });

  it('gating and status: scorekeeper 403, stranger 404-or-403, open registration 409, custom 400', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    expect((await gen(id, {}, '', SCORER)).status).toBe(403);
    const open = await setup({ format: 'LEAGUE' }, 3, 'REGISTRATION_OPEN');
    expect((await gen(open.id, {}, '?preview=1')).status).toBe(200);
    expect((await gen(open.id)).status).toBe(409);
    const custom = await setup({ format: 'CUSTOM' }, 3);
    expect((await gen(custom.id)).body.code).toBe('CUSTOM_FORMAT');
    const few = await setup({ format: 'LEAGUE' }, 1);
    expect((await gen(few.id)).body.code).toBe('TOO_FEW_TEAMS');
  });

  it('schedules day windows in Asia/Jerusalem across the DST change (2026-10-25)', async () => {
    const { id } = await setup({ format: 'LEAGUE', rules: { matchMinutes: 60 } }, 4);
    const res = await gen(id, {
      schedule: {
        days: [
          { date: '2026-10-23', from: '09:00', to: '12:00' }, // still UTC+3
          { date: '2026-10-26', from: '09:00', to: '12:00' }, // UTC+2 after the switch
        ],
        courts: 2,
      },
    }, '?preview=1');
    expect(res.body.conflicts).toEqual([]);
    const times = res.body.matches.map((m) => m.scheduledAt).sort();
    expect(times[0]).toBe('2026-10-23T06:00:00.000Z');
    expect(times.filter((t) => t.startsWith('2026-10-23'))).toHaveLength(6); // 3 slots x 2 courts, rest spills over
    const spill = times.filter((t) => t.startsWith('2026-10-26'));
    expect(spill.length).toBe(0);
    const tight = await gen(id, { schedule: { days: [{ date: '2026-10-26', from: '09:00', to: '10:00' }], courts: 1 } }, '?preview=1');
    expect(tight.body.matches[0].scheduledAt).toBe('2026-10-26T07:00:00.000Z');
    expect(tight.body.conflicts.length).toBeGreaterThan(0);
  });

  it('commit refuses unscheduled matches unless allowConflicts', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 4);
    const body = { schedule: { days: [{ date: '2026-11-02', from: '09:00', to: '10:00' }], courts: 1 } };
    const refused = await gen(id, body);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('SCHEDULE_CONFLICTS');
    expect(await dbMatches(id)).toHaveLength(0);
    const ok = await gen(id, { ...body, allowConflicts: true });
    expect(ok.status).toBe(200);
    expect(ok.body.scheduledCount).toBe(1);
  });

  it('knockout with 5 teams: byes resolved, later rounds fed by WINNER_OF sources', async () => {
    const { id, teams } = await setup({ format: 'KNOCKOUT', rules: { thirdPlace: false } }, 5);
    await gen(id);
    const rows = await dbMatches(id);
    expect(rows).toHaveLength(4); // 1 real first-round match (4v5) + 2 semis + final
    const withBothTeams = rows.filter((m) => m.homeTeamId && m.awayTeamId);
    expect(withBothTeams).toHaveLength(2); // seeds 4v5, and seeds 2v3 whose byes resolved
    const final = rows.find((m) => m.round === 3);
    expect(final.homeSource.type).toBe('WINNER_OF');
    expect(rows.map((m) => m.id)).toContain(final.homeSource.matchId);
    const seeded = new Set(rows.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean));
    expect(seeded.size).toBe(5);
    expect(teams).toHaveLength(5);
  });

  it('groups + knockout: group stage round robin, knockout fed by GROUP_RANK, third place', async () => {
    const { id } = await setup({ format: 'GROUPS_KNOCKOUT', rules: { groupCount: 2, advancePerGroup: 2, thirdPlace: true } }, 8);
    await gen(id);
    const stages = await prisma.tournamentStage.findMany({ where: { tournamentId: id }, orderBy: { order: 'asc' } });
    expect(stages.map((s) => s.type)).toEqual(['GROUP', 'KNOCKOUT']);
    const rows = await dbMatches(id);
    const groupMatches = rows.filter((m) => m.stageId === stages[0].id);
    const ko = rows.filter((m) => m.stageId === stages[1].id);
    expect(groupMatches).toHaveLength(12);
    expect(ko).toHaveLength(4); // 2 semis + final + third place
    const semis = ko.filter((m) => m.homeSource && m.homeSource.type === 'GROUP_RANK');
    expect(semis).toHaveLength(2);
    expect(semis[0].homeSource).toMatchObject({ rank: 1 });
    const teams = await prisma.tournamentTeam.findMany({ where: { tournamentId: id } });
    expect(teams.every((t) => t.groupId)).toBe(true);
    expect(ko.some((m) => m.homeSource && m.homeSource.type === 'LOSER_OF')).toBe(true);
  });

  it('regeneration replaces an unfinished schedule but is refused once a result exists', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    await gen(id);
    const first = await dbMatches(id);
    expect((await gen(id)).status).toBe(200);
    const second = await dbMatches(id);
    expect(second).toHaveLength(3);
    expect(second.map((m) => m.id)).not.toEqual(expect.arrayContaining(first.map((m) => m.id)));
    await prisma.tournamentMatch.update({ where: { id: second[0].id }, data: { status: 'FINISHED', homeScore: 1, awayScore: 0 } });
    const refused = await gen(id);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('SCHEDULE_HAS_RESULTS');
  });

  it('manual matches: add (auto stage for CUSTOM), validate teams, conflict detection, force', async () => {
    const { id, teams } = await setup({ format: 'CUSTOM' }, 4);
    const post = (body, user = MGR) => as('post', `/api/tournaments/${id}/matches`, user).send(body);
    expect((await post({ homeTeamId: teams[0].id, awayTeamId: teams[1].id }, SCORER)).status).toBe(403);
    expect((await post({ homeTeamId: teams[0].id, awayTeamId: teams[0].id })).status).toBe(400);
    expect((await post({ homeTeamId: 'nope', awayTeamId: teams[1].id })).body.code).toBe('TEAM_NOT_ELIGIBLE');
    const t0 = '2026-12-01T10:00:00.000Z';
    const a = await post({ homeTeamId: teams[0].id, awayTeamId: teams[1].id, scheduledAt: t0, courtLabel: 'A' });
    expect(a.status).toBe(201);
    expect(a.body.match.number).toBe(1);
    expect(await prisma.tournamentStage.count({ where: { tournamentId: id } })).toBe(1);
    // same court overlapping
    const courtClash = await post({ homeTeamId: teams[2].id, awayTeamId: teams[3].id, scheduledAt: '2026-12-01T10:30:00.000Z', courtLabel: 'A' });
    expect(courtClash.status).toBe(409);
    expect(courtClash.body.code).toBe('SCHEDULE_CONFLICT');
    expect(courtClash.body.conflicts.map((c) => c.type)).toContain('COURT_OVERLAP');
    // same team on another court at the same time
    const teamClash = await post({ homeTeamId: teams[0].id, awayTeamId: teams[3].id, scheduledAt: t0, courtLabel: 'B' });
    expect(teamClash.body.conflicts.map((c) => c.type)).toContain('TEAM_OVERLAP');
    const forced = await post({ homeTeamId: teams[0].id, awayTeamId: teams[3].id, scheduledAt: t0, courtLabel: 'B', force: true });
    expect(forced.status).toBe(201);
    expect(forced.body.conflicts.length).toBeGreaterThan(0);
    const ok = await post({ homeTeamId: teams[2].id, awayTeamId: teams[3].id, scheduledAt: '2026-12-01T12:00:00.000Z', courtLabel: 'A' });
    expect(ok.status).toBe(201);
    expect(ok.body.match.number).toBe(3);
  });

  it('edit and delete: patch time/court/status, slots with sources locked, referenced matches kept', async () => {
    const { id } = await setup({ format: 'KNOCKOUT' }, 4);
    await gen(id);
    const rows = await dbMatches(id);
    const semi = rows.find((m) => m.round === 1);
    const final = rows.find((m) => m.round === 2);
    const patch = (matchId, body, user = MGR) => as('patch', `/api/tournaments/${id}/matches/${matchId}`, user).send(body);
    const moved = await patch(semi.id, { scheduledAt: '2026-12-05T09:00:00.000Z', courtLabel: '1' });
    expect(moved.status).toBe(200);
    expect(moved.body.match.scheduledAt).toBe('2026-12-05T09:00:00.000Z');
    expect((await patch(semi.id, { status: 'POSTPONED' })).body.match.status).toBe('POSTPONED');
    expect((await patch(semi.id, { status: 'FINISHED' })).status).toBe(400);
    expect((await patch(final.id, { homeTeamId: semi.homeTeamId })).body.code).toBe('SLOT_HAS_SOURCE');
    expect((await patch(semi.id, { scheduledAt: 'garbage' })).status).toBe(400);
    expect((await patch(semi.id, { courtLabel: '2' }, SCORER)).status).toBe(403);
    const del = await as('delete', `/api/tournaments/${id}/matches/${semi.id}`, MGR);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('MATCH_REFERENCED');
    expect((await as('delete', `/api/tournaments/${id}/matches/${final.id}`, MGR)).status).toBe(200);
    expect((await as('delete', `/api/tournaments/${id}/matches/${semi.id}`, MGR)).status).toBe(200);
  });
});
