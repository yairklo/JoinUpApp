const request = require('supertest');

jest.setTimeout(180000);
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
const { isSingleTableStage } = require('../services/tournamentResultService');
const { useOpenTournaments, prisma, ensureUsers, tournamentBody, cleanup, seedTeams } = require('./helpers/tournamentFixtures');

const P = 'tovr_';
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

const matchesOf = (id) => prisma.tournamentMatch.findMany({ where: { tournamentId: id }, orderBy: { number: 'asc' } });
const putResult = (id, m, body, user = SCORER) => as('put', `/api/tournaments/${id}/matches/${m.id}/result`, user)
  .send({ status: 'FINISHED', expectedVersion: m.version, ...body });
const standings = (id, user) => (user ? as('get', `/api/tournaments/${id}/standings`, user) : request(app).get(`/api/tournaments/${id}/standings`));
const putOverride = (id, body, user = MGR) => as('put', `/api/tournaments/${id}/standings/override`, user).send(body);
const delOverride = (id, body, user = MGR) => as('delete', `/api/tournaments/${id}/standings/override`, user).send(body);

describe('manual standings override', () => {
  useOpenTournaments();

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

  it('permissions, display, additive adjustments, sticky order after a new result, and reset', async () => {
    const { id } = await setup({ format: 'LEAGUE' }, 3);
    const [m1] = await matchesOf(id);
    expect((await putResult(id, m1, { homeScore: 2, awayScore: 0 })).status).toBe(200);
    const before = (await standings(id)).body.tables[0];
    expect(before.manualOrder).toBe(false);
    expect(before.rows[0]).toMatchObject({ points: 3, autoPoints: 3, pointsAdjustment: 0, adjustmentReason: null });
    const autoOrder = before.rows.map((r) => r.team.id);
    const winner = autoOrder[0];
    const manualOrder = [...autoOrder].reverse();
    expect(manualOrder[0]).not.toBe(winner);

    const body = {
      stageId: before.stageId,
      groupId: null,
      teamOrder: manualOrder,
      adjustments: [{ teamId: winner, points: -1, reason: 'עבירה' }],
    };
    expect((await putOverride(id, body, STRANGER)).status).toBe(403);
    expect((await putOverride(id, body, SCORER)).status).toBe(403);
    expect((await delOverride(id, { stageId: before.stageId, groupId: null }, SCORER)).status).toBe(403);

    const saved = await putOverride(id, body, MGR);
    expect(saved.status).toBe(200);
    expect(saved.body.ok).toBe(true);

    const shown = (await standings(id, STRANGER)).body.tables[0];
    expect(shown.manualOrder).toBe(true);
    expect(shown.rows.map((r) => r.team.id)).toEqual(manualOrder);
    const adjusted = shown.rows.find((r) => r.team.id === winner);
    expect(adjusted).toMatchObject({
      played: 1, won: 1, gf: 2, ga: 0, gd: 2, autoPoints: 3, points: 2, pointsAdjustment: -1, adjustmentReason: 'עבירה',
    });
    expect(shown.rows.filter((r) => r.team.id !== winner).every((r) => r.pointsAdjustment === 0 && r.adjustmentReason === null)).toBe(true);
    // A per-team manualRank pin does not reshuffle a published table override.
    expect((await as('patch', `/api/tournaments/${id}/teams/${winner}`, MGR).send({ manualRank: 1 })).status).toBe(200);
    expect((await standings(id)).body.tables[0].rows.map((r) => r.team.id)).toEqual(manualOrder);

    expect((await putOverride(id, { ...body, teamOrder: autoOrder.slice(0, 2) }, ORG)).status).toBe(400);
    expect((await putOverride(id, { ...body, adjustments: [{ teamId: winner, points: 0, reason: 'עבירה' }] }, ORG)).status).toBe(400);
    expect((await putOverride(id, { ...body, adjustments: [{ teamId: winner, points: -1, reason: '  ' }] }, ORG)).status).toBe(400);
    // the rejected writes did not replace the saved override
    expect((await standings(id)).body.tables[0].rows.map((r) => r.team.id)).toEqual(manualOrder);

    const next = (await matchesOf(id)).find((m) => m.status === 'SCHEDULED' && (m.homeTeamId === winner || m.awayTeamId === winner));
    const winnerIsHome = next.homeTeamId === winner;
    const res = await putResult(id, next, winnerIsHome ? { homeScore: 0, awayScore: 1 } : { homeScore: 1, awayScore: 0 });
    expect(res.status).toBe(200);
    const afterResult = (await standings(id)).body.tables[0];
    expect(afterResult.rows.map((r) => r.team.id)).toEqual(manualOrder);
    const winnerRow = afterResult.rows.find((r) => r.team.id === winner);
    expect(winnerRow.played).toBe(2);
    expect(winnerRow.lost).toBe(1);
    expect(winnerRow.autoPoints).toBe(3);
    expect(winnerRow.points).toBe(2);
    expect(winnerRow.adjustmentReason).toBe('עבירה');

    const resetDenied = await delOverride(id, { stageId: before.stageId, groupId: null }, STRANGER);
    expect(resetDenied.status).toBe(403);
    const reset = await delOverride(id, { stageId: before.stageId, groupId: null }, ORG);
    expect(reset.status).toBe(200);
    const back = (await standings(id)).body.tables[0];
    expect(back.manualOrder).toBe(false);
    expect(back.rows.find((r) => r.team.id === winner)).toMatchObject({ points: 3, autoPoints: 3, pointsAdjustment: 0, adjustmentReason: null, played: 2 });
    expect((await delOverride(id, { stageId: before.stageId, groupId: null }, MGR)).status).toBe(404);
  });

  it('a group override reorders knockout qualification, and a knockout stage is rejected', async () => {
    const { id } = await setup({
      format: 'GROUPS_KNOCKOUT', rules: { groupCount: 2, advancePerGroup: 1, tiebreak: ['GOAL_DIFFERENCE'] },
    }, 4);
    const stages = await prisma.tournamentStage.findMany({ where: { tournamentId: id }, orderBy: { order: 'asc' } });
    const groups = await prisma.tournamentGroup.findMany({ where: { stageId: stages[0].id }, orderBy: { name: 'asc' } });
    const rows = await matchesOf(id);
    const groupMatch = rows.find((m) => m.groupId === groups[0].id);
    expect((await putResult(id, groupMatch, { homeScore: 1, awayScore: 0 })).status).toBe(200);
    const other = rows.find((m) => m.groupId === groups[1].id);
    expect((await putResult(id, other, { homeScore: 2, awayScore: 0 })).status).toBe(200);

    const table = (await standings(id)).body.tables.find((t) => t.groupId === groups[0].id);
    expect(table.manualOrder).toBe(false);
    expect(table.rows[0].team.id).toBe(groupMatch.homeTeamId);
    const koBefore = await prisma.tournamentMatch.findMany({ where: { stageId: stages[1].id } });
    const advanced = koBefore.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
    expect(advanced).toContain(groupMatch.homeTeamId);

    const flipped = [...table.rows.map((r) => r.team.id)].reverse();
    const saved = await putOverride(id, {
      stageId: table.stageId,
      groupId: table.groupId,
      teamOrder: flipped,
      adjustments: [{ teamId: groupMatch.homeTeamId, points: -3, reason: 'הפסד טכני' }],
    });
    expect(saved.status).toBe(200);
    const shown = (await standings(id)).body.tables.find((t) => t.groupId === groups[0].id);
    expect(shown.manualOrder).toBe(true);
    expect(shown.needsManualRank).toBe(false);
    expect(shown.rows.map((r) => r.team.id)).toEqual(flipped);
    expect(shown.rows.find((r) => r.team.id === groupMatch.homeTeamId)).toMatchObject({
      autoPoints: 3, points: 0, pointsAdjustment: -3, adjustmentReason: 'הפסד טכני', gf: 1,
    });
    const koAfter = await prisma.tournamentMatch.findMany({ where: { stageId: stages[1].id } });
    const advancedAfter = koAfter.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
    expect(advancedAfter).toContain(flipped[0]);
    expect(advancedAfter).not.toContain(groupMatch.homeTeamId);

    const koStage = stages.find((s) => s.type === 'KNOCKOUT');
    expect((await putOverride(id, { stageId: koStage.id, groupId: null, teamOrder: flipped })).status).toBe(400);
  });

  async function playLeague(id, leagueStageId, bestFirst) {
    const rank = new Map(bestFirst.map((teamId, i) => [teamId, i]));
    for (let guard = 0; guard < 12; guard += 1) {
      const open = (await matchesOf(id)).filter((m) => m.stageId === leagueStageId && m.status === 'SCHEDULED');
      if (!open.length) return;
      for (const m of open) {
        const homeWins = rank.get(m.homeTeamId) < rank.get(m.awayTeamId);
        const res = await putResult(id, m, homeWins ? { homeScore: 1, awayScore: 0 } : { homeScore: 0, awayScore: 1 });
        expect(res.status).toBe(200);
      }
    }
    throw new Error('league matches did not finish');
  }

  async function addKnockoutFinal(id, leagueStageId) {
    const ko = await prisma.tournamentStage.create({
      data: { tournamentId: id, order: 1, type: 'KNOCKOUT', name: 'נוקאאוט', config: {} },
    });
    const max = await prisma.tournamentMatch.aggregate({ where: { tournamentId: id }, _max: { number: true } });
    await prisma.tournamentMatch.create({
      data: {
        tournamentId: id,
        stageId: ko.id,
        round: 1,
        number: (max._max.number || 0) + 1,
        homeSource: { type: 'LEAGUE_RANK', stageId: leagueStageId, rank: 1, pos: 1 },
        awaySource: { type: 'LEAGUE_RANK', stageId: leagueStageId, rank: 2, pos: 2 },
      },
    });
    return ko;
  }

  const knockoutPair = (stageId) => prisma.tournamentMatch.findFirst({ where: { stageId } });

  it('treats every non-group, non-knockout stage as one table', () => {
    expect(isSingleTableStage({ type: 'LEAGUE' })).toBe(true);
    expect(isSingleTableStage({ type: 'ROUND_ROBIN' })).toBe(true);
    expect(isSingleTableStage({ type: 'GROUP' })).toBe(false);
    expect(isSingleTableStage({ type: 'KNOCKOUT' })).toBe(false);
    expect(isSingleTableStage(null)).toBe(false);
  });

  it('seeds a knockout final from the computed league table when there is no override', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const league = await prisma.tournamentStage.findFirst({ where: { tournamentId: id, type: 'LEAGUE' } });
    const ko = await addKnockoutFinal(id, league.id);
    const bestFirst = teams.map((team) => team.id);
    await playLeague(id, league.id, bestFirst);
    const table = (await standings(id)).body.tables[0];
    expect(table.manualOrder).toBe(false);
    expect(table.rows.map((r) => r.team.id)).toEqual(bestFirst);
    const final = await knockoutPair(ko.id);
    expect(final.homeTeamId).toBe(table.rows[0].team.id);
    expect(final.awayTeamId).toBe(table.rows[1].team.id);
  });

  it('seeds a knockout final from the manual league order, not from adjusted points', async () => {
    const { id, teams } = await setup({ format: 'LEAGUE' }, 3);
    const league = await prisma.tournamentStage.findFirst({ where: { tournamentId: id, type: 'LEAGUE' } });
    const ko = await addKnockoutFinal(id, league.id);
    const bestFirst = teams.map((team) => team.id);
    await playLeague(id, league.id, bestFirst);
    const before = (await standings(id)).body.tables[0];
    const computed = before.rows.map((r) => r.team.id);
    expect(computed).toEqual(bestFirst);
    const manual = [...computed].reverse();
    const winner = computed[0];
    const saved = await putOverride(id, {
      stageId: before.stageId,
      groupId: null,
      teamOrder: manual,
      adjustments: [{ teamId: winner, points: 5, reason: 'בונוס' }],
    });
    expect(saved.status).toBe(200);
    const shown = (await standings(id)).body.tables[0];
    expect(shown.manualOrder).toBe(true);
    expect(shown.rows.map((r) => r.team.id)).toEqual(manual);
    const adjusted = shown.rows.find((r) => r.team.id === winner);
    expect(adjusted.points).toBe(adjusted.autoPoints + 5);
    expect(adjusted.rank).not.toBe(1);
    const final = await knockoutPair(ko.id);
    expect([final.homeTeamId, final.awayTeamId]).toEqual([manual[0], manual[1]]);
    expect(final.homeTeamId).not.toBe(winner);
  });
});
