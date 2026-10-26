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

const P = 'tres_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const SCORER = `${P}scorer`;
const STRANGER = `${P}stranger`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);

async function setup(over, teamCount) {
  const res = await as('post', '/api/tournaments', ORG).send(tournamentBody({ maxTeams: 32, ...over }));
  expect(res.status).toBe(201);
  const id = res.body.id;
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: MGR, role: 'MANAGER' });
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: SCORER, role: 'SCOREKEEPER' });
  const teams = await seedTeams(P, id, teamCount);
  await prisma.tournament.update({ where: { id }, data: { status: 'REGISTRATION_CLOSED' } });
  const g = await as('post', `/api/tournaments/${id}/schedule/generate`, MGR).send({});
  expect(g.status).toBe(200);
  await prisma.tournament.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  return { id, teams };
}
const matches = (id) => prisma.tournamentMatch.findMany({ where: { tournamentId: id }, orderBy: { number: 'asc' } });
const putResult = (id, m, body, user = SCORER) => as('put', `/api/tournaments/${id}/matches/${m.id}/result`, user)
  .send({ status: 'FINISHED', expectedVersion: m.version, ...body });
const fresh = async (id, matchId) => prisma.tournamentMatch.findUnique({ where: { id: matchId } });

describe('tournament results, advancement and views', () => {
  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    await ensureUsers([ORG, MGR, SCORER, STRANGER]);
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('permissions: scorekeeper writes results only; stranger 403; not in progress 409', async () => {
    const { id } = await setup({ format: 'KNOCKOUT', rules: { thirdPlace: true } }, 4);
    const [m1] = await matches(id);
    expect((await putResult(id, m1, { homeScore: 1, awayScore: 0 }, STRANGER)).status).toBe(403);
    expect((await as('patch', `/api/tournaments/${id}/matches/${m1.id}`, SCORER).send({ courtLabel: 'x' })).status).toBe(403);
    expect((await as('post', `/api/tournaments/${id}/roles`, MGR).send({ userId: STRANGER, role: 'MANAGER' })).status).toBe(403);
    const ok = await putResult(id, m1, { homeScore: 2, awayScore: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.match.version).toBe(1);
    expect(ok.body.match.winnerTeamId).toBe(m1.homeTeamId);
    await prisma.tournament.update({ where: { id }, data: { status: 'REGISTRATION_CLOSED' } });
    expect((await putResult(id, await fresh(id, m1.id), { homeScore: 0, awayScore: 3 })).body.code).toBe('NOT_IN_PROGRESS');
  });

  it('versioning: missing expectedVersion 400, stale 409 with currentVersion, concurrent writers', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    const [m1] = await matches(id);
    expect((await as('put', `/api/tournaments/${id}/matches/${m1.id}/result`, SCORER).send({ status: 'FINISHED', homeScore: 1, awayScore: 0 })).status).toBe(400);
    expect((await putResult(id, m1, { homeScore: 1, awayScore: 0 })).status).toBe(200);
    const stale = await putResult(id, m1, { homeScore: 5, awayScore: 5 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 1 });
    const [m2] = (await matches(id)).slice(1);
    const [a, b] = await Promise.all([putResult(id, m2, { homeScore: 1, awayScore: 1 }), putResult(id, m2, { homeScore: 2, awayScore: 2 }, MGR)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('validation: scores, draws allowed in league, penalties rules', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    const [m1] = await matches(id);
    expect((await putResult(id, m1, { homeScore: -1, awayScore: 0 })).status).toBe(400);
    expect((await putResult(id, m1, { homeScore: 'a', awayScore: 0 })).status).toBe(400);
    expect((await putResult(id, m1, { homeScore: 1, awayScore: 1, penalties: { home: 4, away: 3 } })).body.code).toBe('PENALTIES_NOT_ALLOWED');
    const draw = await putResult(id, m1, { homeScore: 1, awayScore: 1 });
    expect(draw.status).toBe(200);
    expect(draw.body.match.winnerTeamId).toBeNull();
  });

  it('knockout: advances winner/loser, needs penalties on a draw, third place fed by losers', async () => {
    const { id } = await setup({ format: 'KNOCKOUT', rules: { thirdPlace: true } }, 4);
    let rows = await matches(id);
    const [s1, s2] = rows.filter((m) => m.round === 1);
    const draw = await putResult(id, s1, { homeScore: 1, awayScore: 1 });
    expect(draw.body.code).toBe('NEEDS_PENALTIES');
    const pen = await putResult(id, s1, { homeScore: 1, awayScore: 1, penalties: { home: 3, away: 5 } });
    expect(pen.status).toBe(200);
    expect(pen.body.match.winnerTeamId).toBe(s1.awayTeamId);
    expect(pen.body.changedMatchIds).toHaveLength(2); // final home slot + third place
    expect((await putResult(id, s2, { homeScore: 3, awayScore: 0 })).status).toBe(200);
    rows = await matches(id);
    const final = rows.find((m) => m.round === 2 && m.homeSource.type === 'WINNER_OF');
    const third = rows.find((m) => m.round === 2 && m.homeSource.type === 'LOSER_OF');
    expect(final.homeTeamId).toBe(s1.awayTeamId);
    expect(final.awayTeamId).toBe(s2.homeTeamId);
    expect(third.homeTeamId).toBe(s1.homeTeamId);
    expect(third.awayTeamId).toBe(s2.awayTeamId);
    // bracket view
    const bracket = (await request(app).get(`/api/tournaments/${id}/bracket`)).body;
    expect(bracket.stages[0].rounds.map((r) => r.name)).toHaveLength(2);
    expect(bracket.stages[0].rounds[1].matches.some((m) => m.isThirdPlace)).toBe(true);
  });

  it('editing a finished match: same winner leaves downstream alone; different winner is refused when downstream is finished unless organizer forces', async () => {
    const { id } = await setup({ format: 'KNOCKOUT' }, 4);
    const rows = await matches(id);
    const [s1, s2] = rows.filter((m) => m.round === 1);
    const fin0 = rows.find((m) => m.round === 2);
    await putResult(id, s1, { homeScore: 2, awayScore: 0 });
    await putResult(id, s2, { homeScore: 1, awayScore: 0 });
    let final = await fresh(id, fin0.id);
    expect((await putResult(id, final, { homeScore: 4, awayScore: 2 })).status).toBe(200);
    // correct the score of semi 1 without changing the winner: fine
    const s1v = await fresh(id, s1.id);
    expect((await putResult(id, s1v, { homeScore: 3, awayScore: 1 })).status).toBe(200);
    // change the winner of semi 1: the finished final would change
    const s1v2 = await fresh(id, s1.id);
    const refused = await putResult(id, s1v2, { homeScore: 0, awayScore: 1 });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'DOWNSTREAM_FINISHED', canForce: false });
    expect((await putResult(id, s1v2, { homeScore: 0, awayScore: 1, force: true }, MGR)).status).toBe(409); // managers cannot force
    expect((await fresh(id, s1.id)).winnerTeamId).toBe(s1.homeTeamId); // rolled back
    const forced = await putResult(id, s1v2, { homeScore: 0, awayScore: 1, force: true }, ORG);
    expect(forced.status).toBe(200);
    final = await fresh(id, fin0.id);
    expect(final.status).toBe('SCHEDULED');
    expect(final.homeScore).toBeNull();
    expect(final.winnerTeamId).toBeNull();
    expect(final.homeTeamId).toBe(s1.awayTeamId);
  });

  it('undo (status SCHEDULED) clears the winner from downstream slots', async () => {
    const { id } = await setup({ format: 'KNOCKOUT' }, 4);
    const [s1] = (await matches(id)).filter((m) => m.round === 1);
    await putResult(id, s1, { homeScore: 1, awayScore: 0 });
    const done = await fresh(id, s1.id);
    const undo = await as('put', `/api/tournaments/${id}/matches/${s1.id}/result`, SCORER).send({ status: 'SCHEDULED', expectedVersion: done.version });
    expect(undo.status).toBe(200);
    const final = (await matches(id)).find((m) => m.round === 2);
    expect(final.homeTeamId).toBeNull();
  });

  it('forfeit gives the configured score; standings count it', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const [m1] = await matches(id);
    const res = await putResult(id, m1, { status: 'FORFEIT', forfeitBy: m1.homeTeamId });
    expect(res.body.match).toMatchObject({ status: 'FORFEIT', homeScore: 0, awayScore: 3, winnerTeamId: m1.awayTeamId });
    expect((await putResult(id, await fresh(id, m1.id), { status: 'FORFEIT', forfeitBy: 'x' })).status).toBe(400);
    const st = (await request(app).get(`/api/tournaments/${id}/standings`)).body;
    expect(st.tables).toHaveLength(1);
    const winner = st.tables[0].rows.find((r) => r.team.id === m1.awayTeamId);
    expect(winner).toMatchObject({ played: 1, won: 1, points: 3, gf: 3 });
    expect(st.tables[0].rows).toHaveLength(teams.length);
  });

  it('tennis: set scores decide the winner', async () => {
    const { id } = await setup({ sport: 'TENNIS', format: 'LEAGUE', rules: { bestOf: 3 } }, 3);
    const [m1] = await matches(id);
    const bad = await putResult(id, m1, { details: { sets: [[6, 4]] } });
    expect(bad.status).toBe(400);
    const ok = await putResult(id, m1, { details: { sets: [[6, 4], [3, 6], [7, 5]] } });
    expect(ok.status).toBe(200);
    expect(ok.body.match).toMatchObject({ homeScore: 2, awayScore: 1, winnerTeamId: m1.homeTeamId });
    expect(ok.body.match.details.sets).toHaveLength(3);
  });

  it('groups: knockout slots fill only when the whole group is finished; manualRank resolves unseparable ties', async () => {
    const { id, teams } = await setup({
      format: 'GROUPS_KNOCKOUT', rules: { groupCount: 2, advancePerGroup: 2, tiebreak: ['GOAL_DIFFERENCE'] },
    }, 6);
    const rows = await matches(id);
    const stages = await prisma.tournamentStage.findMany({ where: { tournamentId: id }, orderBy: { order: 'asc' } });
    const groups = await prisma.tournamentGroup.findMany({ where: { stageId: stages[0].id }, orderBy: { name: 'asc' } });
    const gm = (g) => rows.filter((m) => m.groupId === g.id);
    const ko = () => prisma.tournamentMatch.findMany({ where: { stageId: stages[1].id }, orderBy: { number: 'asc' } });
    expect(gm(groups[0])).toHaveLength(3);
    // group A: every match drawn -> tie the tiebreakers cannot separate
    for (const m of gm(groups[0])) await putResult(id, await fresh(id, m.id), { homeScore: 1, awayScore: 1 });
    // group B: decisive, but one match still open at first
    const [b1, b2, b3] = gm(groups[1]);
    await putResult(id, b1, { homeScore: 2, awayScore: 0 });
    await putResult(id, b2, { homeScore: 2, awayScore: 0 });
    let semis = await ko();
    expect(semis.every((m) => m.homeTeamId === null && m.awayTeamId === null)).toBe(true); // B not complete, A unresolved
    await putResult(id, b3, { homeScore: 1, awayScore: 0 });
    semis = await ko();
    const groupBTeams = new Set(teams.filter((x) => rows.filter((m) => m.groupId === groups[1].id).some((m) => [m.homeTeamId, m.awayTeamId].includes(x.id))).map((x) => x.id));
    const filledB = semis.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((x) => x && groupBTeams.has(x));
    expect(filledB).toHaveLength(2);
    // the standings flag the tie
    const st = (await as('get', `/api/tournaments/${id}/standings`, MGR)).body;
    const tableA = st.tables.find((x) => x.groupId === groups[0].id);
    expect(tableA).toMatchObject({ complete: true, needsManualRank: true });
    // organizer breaks the tie with manualRank
    const order = tableA.rows.map((r) => r.team.id);
    for (let i = 0; i < order.length; i += 1) {
      const r = await as('patch', `/api/tournaments/${id}/teams/${order[i]}`, MGR).send({ manualRank: i + 1 });
      expect(r.status).toBe(200);
    }
    semis = await ko();
    const filledA = semis.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((x) => x && !groupBTeams.has(x));
    expect(filledA.sort()).toEqual([order[0], order[1]].sort());
    const after = (await as('get', `/api/tournaments/${id}/standings`, MGR)).body.tables.find((x) => x.groupId === groups[0].id);
    expect(after.rows.map((r) => r.team.id)).toEqual(order);
  });

  it('player stats: written with the result, validated, aggregated into leaders, hideMatchStats respected', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const [m1] = await matches(id);
    const home = teams.find((x) => x.id === m1.homeTeamId);
    const away = teams.find((x) => x.id === m1.awayTeamId);
    const [h1, h2] = home.playerIds;
    const [a1] = away.playerIds;
    expect((await putResult(id, m1, { homeScore: 2, awayScore: 1, stats: { [`${P}nobody`]: { goals: 1 } } })).body.code).toBe('INVALID_STATS');
    expect((await putResult(id, m1, { homeScore: 2, awayScore: 1, stats: { [h1]: { flying: 1 } } })).body.code).toBe('INVALID_STATS');
    const ok = await putResult(id, m1, { homeScore: 2, awayScore: 1, stats: { [h1]: { goals: 2 }, [a1]: { goals: 1 } } });
    expect(ok.status).toBe(200);
    expect(ok.body.warnings).toEqual([]);
    const entries = await prisma.playerStatEntry.findMany({ where: { tournamentMatchId: m1.id } });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.gameId === null && e.sideId === null)).toBe(true);
    // totals above the score only warn
    const cur = await fresh(id, m1.id);
    const warn = await putResult(id, cur, { homeScore: 2, awayScore: 1, stats: { [h1]: { goals: 2 }, [h2]: { goals: 2 } } });
    expect(warn.body.warnings[0]).toMatchObject({ code: 'PLAYER_SUM_EXCEEDS_SCORE' });
    const leaders = (await request(app).get(`/api/tournaments/${id}/stats/leaders?key=goals`)).body;
    expect(leaders.leaders.map((l) => [l.userId, l.value])).toEqual(expect.arrayContaining([[h1, 2], [h2, 2]]));
    expect(leaders.leaders[0].teamName).toBe(home.name);
    expect((await request(app).get(`/api/tournaments/${id}/stats/leaders?key=nope`)).status).toBe(400);
    await prisma.user.update({ where: { id: h2 }, data: { hideMatchStats: true } });
    const hidden = (await request(app).get(`/api/tournaments/${id}/stats/leaders?key=goals`)).body;
    expect(hidden.leaders.map((l) => l.userId)).not.toContain(h2);
    // resetting the result drops its stats
    const cur2 = await fresh(id, m1.id);
    await as('put', `/api/tournaments/${id}/matches/${m1.id}/result`, SCORER).send({ status: 'SCHEDULED', expectedVersion: cur2.version });
    expect(await prisma.playerStatEntry.count({ where: { tournamentMatchId: m1.id } })).toBe(0);
  });

  it('withdrawing a scheduled team forfeits its matches', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const res = await as('delete', `/api/tournaments/${id}/teams/${teams[0].id}`, MGR);
    expect(res.status).toBe(200);
    expect(res.body.affectedMatchIds).toHaveLength(2);
    const rows = await prisma.tournamentMatch.findMany({ where: { tournamentId: id, OR: [{ homeTeamId: teams[0].id }, { awayTeamId: teams[0].id }] } });
    expect(rows.every((m) => m.status === 'FORFEIT' && m.winnerTeamId !== teams[0].id)).toBe(true);
  });

  it('schedule view filters by team/status; drafts are hidden from strangers', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 4);
    const all = (await request(app).get(`/api/tournaments/${id}/schedule`)).body;
    expect(all.matches).toHaveLength(6);
    expect(all.matches[0].home.team.name).toBeTruthy();
    const mine = (await request(app).get(`/api/tournaments/${id}/schedule?teamId=${teams[0].id}`)).body;
    expect(mine.matches).toHaveLength(3);
    expect((await request(app).get(`/api/tournaments/${id}/schedule?status=FINISHED`)).body.matches).toHaveLength(0);
    expect((await request(app).get(`/api/tournaments/${id}/schedule?from=bad`)).status).toBe(400);
    await prisma.tournament.update({ where: { id }, data: { status: 'DRAFT' } });
    expect((await as('get', `/api/tournaments/${id}/standings`, STRANGER)).status).toBe(404);
    expect((await as('get', `/api/tournaments/${id}/schedule`, ORG)).status).toBe(200);
  });

  it('emits tournament:update to the tournament room (no payload secrets)', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    const io = app.get('io');
    const emit = jest.fn();
    const spy = jest.spyOn(io, 'to').mockReturnValue({ emit });
    const [m1] = await matches(id);
    await putResult(id, m1, { homeScore: 1, awayScore: 0 });
    expect(spy).toHaveBeenCalledWith(`tournament:${id}`);
    expect(emit).toHaveBeenCalledWith('tournament:update', expect.objectContaining({ tournamentId: id, type: 'result', matchId: m1.id }));
    spy.mockRestore();
  });
});
