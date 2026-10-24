jest.setTimeout(60000);

const fs = require('fs');
const path = require('path');
const { prisma } = require('../lib/prisma');
const { upsertGameResult, getGameResult, LOCK_WINDOW_MS } = require('../services/gameResultService');
const { computeUserStats } = require('../services/userStatsService');

const U = {
  org: 'mr_org',
  mgr: 'mr_mgr',
  mod: 'mr_mod',
  cap: 'mr_cap',
  p1: 'mr_p1',
  p2: 'mr_p2',
  p3: 'mr_p3',
  out: 'mr_out',
  pending: 'mr_pending',
};
const ALL = Object.values(U);
const HOUR = 3600 * 1000;

describe('multi-round game results', () => {
  let field;
  const gameIds = [];

  async function makeGame() {
    const game = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: U.org,
        start: new Date(Date.now() - 3 * HOUR),
        sport: 'SOCCER',
        status: 'COMPLETED',
        maxPlayers: 10,
        roles: {
          create: [
            { userId: U.org, role: 'ORGANIZER' },
            { userId: U.mgr, role: 'MANAGER' },
            { userId: U.mod, role: 'MODERATOR' },
            { userId: U.cap, role: 'CAPTAIN' },
          ],
        },
        teams: {
          create: [
            { name: 'אדומים', color: '#c00' },
            { name: 'כחולים', color: '#00c' },
            { name: 'ירוקים', color: '#0a0' },
          ],
        },
        participants: {
          create: [
            { userId: U.org, status: 'CONFIRMED' },
            { userId: U.p1, status: 'CONFIRMED' },
            { userId: U.p2, status: 'CONFIRMED' },
            { userId: U.p3, status: 'CONFIRMED' },
            { userId: U.pending, status: 'PENDING' },
          ],
        },
      },
      include: { teams: true },
    });
    const [red, blue, green] = game.teams;
    await prisma.participation.update({ where: { gameId_userId: { gameId: game.id, userId: U.p1 } }, data: { teamId: red.id } });
    await prisma.participation.update({ where: { gameId_userId: { gameId: game.id, userId: U.p2 } }, data: { teamId: blue.id } });
    await prisma.participation.update({ where: { gameId_userId: { gameId: game.id, userId: U.p3 } }, data: { teamId: green.id } });
    gameIds.push(game.id);
    return { game, red, blue, green };
  }

  const fixedBody = (red, blue, green) => ({
    lineupMode: 'FIXED_TEAMS',
    rounds: [
      { sides: [{ label: 'אדומים', teamId: red.id, score: 2, players: [{ userId: U.p1, goals: 2 }] }, { label: 'כחולים', teamId: blue.id, score: 1 }] },
      { sides: [{ label: 'אדומים', teamId: red.id, score: 0 }, { label: 'ירוקים', teamId: green.id, score: 1, players: [{ userId: U.p3, goals: 1 }] }] },
      { sides: [{ label: 'ירוקים', teamId: green.id, score: 1 }, { label: 'כחולים', teamId: blue.id, score: 1 }] },
    ],
  });

  beforeAll(async () => {
    for (const id of ALL) await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } });
    field = await prisma.field.create({ data: { name: 'mr field', location: 'x', price: 0, available: false, type: 'OPEN' } });
  });

  afterAll(async () => {
    try {
      await prisma.playerStatEntry.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.team.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: ALL } } });
    } catch (err) {
      console.warn('multi-round cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  test('permissions match a single-score result: manager and admin yes, everyone else no', async () => {
    const { game, red, blue, green } = await makeGame();
    const body = fixedBody(red, blue, green);
    await expect(upsertGameResult(game.id, U.mod, body)).rejects.toMatchObject({ status: 403, code: 'NOT_MANAGER' });
    await expect(upsertGameResult(game.id, U.cap, body)).rejects.toMatchObject({ status: 403, code: 'NOT_MANAGER' });
    await expect(upsertGameResult(game.id, U.p1, body)).rejects.toMatchObject({ status: 403, code: 'NOT_MANAGER' });
    await expect(upsertGameResult(game.id, U.out, body)).rejects.toMatchObject({ status: 403, code: 'NOT_MANAGER' });
    expect(await prisma.gameResult.count({ where: { gameId: game.id } })).toBe(0);

    const saved = await upsertGameResult(game.id, U.mgr, body);
    expect(saved.result.rounds).toHaveLength(3);
    expect(saved.result.lineupMode).toBe('FIXED_TEAMS');

    await prisma.gameResult.update({ where: { gameId: game.id }, data: { lockedAt: new Date(Date.now() - 1000) } });
    await expect(upsertGameResult(game.id, U.mgr, body)).rejects.toMatchObject({ status: 403, code: 'RESULT_LOCKED' });
    const asAdmin = await upsertGameResult(game.id, U.out, body, { isAdmin: true });
    expect(asAdmin.result.rounds).toHaveLength(3);
    const row = await prisma.gameResult.findUnique({ where: { gameId: game.id } });
    expect(row.lockedAt.getTime()).toBeLessThan(Date.now());
    expect(row.recordedAt.getTime() + LOCK_WINDOW_MS).toBeGreaterThan(row.lockedAt.getTime());
  });

  test('fixed-team summary and profile stats: one game played, round W/D/L separate', async () => {
    const { game, red, blue, green } = await makeGame();
    const before = await computeUserStats(U.p1);
    const beforeSoccer = before.find((s) => s.sport === 'SOCCER') || { games: 0, wins: 0, draws: 0, losses: 0, roundWins: 0, roundDraws: 0, roundLosses: 0, totals: {} };
    const view = await upsertGameResult(game.id, U.org, fixedBody(red, blue, green));
    const byTeam = Object.fromEntries(view.result.summary.teams.map((t) => [t.teamId, t]));
    expect(byTeam[red.id]).toMatchObject({ played: 2, wins: 1, losses: 1, goalsFor: 2, goalsAgainst: 2 });
    expect(byTeam[blue.id]).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, goalsFor: 2 });
    expect(byTeam[green.id]).toMatchObject({ played: 2, wins: 1, draws: 1, goalsFor: 2 });
    const byPlayer = Object.fromEntries(view.result.summary.players.map((p) => [p.userId, p]));
    expect(byPlayer[U.p1]).toMatchObject({ rounds: 2, wins: 1, losses: 1, goals: 2 });
    expect(byPlayer[U.p2]).toMatchObject({ rounds: 2, draws: 1, losses: 1, goals: 0 });
    expect(byPlayer[U.p3]).toMatchObject({ rounds: 2, wins: 1, draws: 1, goals: 1 });

    // A legacy one-score body must not wipe the evening.
    await expect(upsertGameResult(game.id, U.org, {
      sides: [{ label: 'אדומים', score: 1 }, { label: 'כחולים', score: 0 }],
    })).rejects.toMatchObject({ status: 409, code: 'MULTI_ROUND_RESULT' });
    expect(await prisma.gameResultRound.count({ where: { result: { gameId: game.id } } })).toBe(3);

    const stats = await computeUserStats(U.p1);
    const soccer = stats.find((s) => s.sport === 'SOCCER');
    // Delta, so other evenings for the same player in this file do not hide the policy.
    expect(soccer.games - beforeSoccer.games).toBe(1);
    expect(soccer.wins - beforeSoccer.wins).toBe(0);
    expect(soccer.draws - beforeSoccer.draws).toBe(0);
    expect(soccer.losses - beforeSoccer.losses).toBe(0);
    expect((soccer.gamesWithOutcome || 0) - (beforeSoccer.gamesWithOutcome || 0)).toBe(0);
    expect(soccer.roundWins - beforeSoccer.roundWins).toBe(1);
    expect(soccer.roundLosses - beforeSoccer.roundLosses).toBe(1);
    expect(soccer.roundDraws - (beforeSoccer.roundDraws || 0)).toBe(0);
    expect(soccer.totals.goals - (beforeSoccer.totals.goals || 0)).toBe(2);
  });

  test('rotating lineups: players prefilled as lists, summary is per player, stranger cannot be listed', async () => {
    const { game } = await makeGame();
    await expect(upsertGameResult(game.id, U.org, {
      lineupMode: 'ROTATING_LINEUPS',
      rounds: [
        { sides: [{ label: 'א׳', score: 1, players: [{ userId: U.out, goals: 1 }] }, { label: 'ב׳', score: 0, players: [{ userId: U.p2, goals: 0 }] }] },
      ],
    })).rejects.toMatchObject({ status: 400, code: 'NOT_CONFIRMED_PARTICIPANT' });
    await expect(upsertGameResult(game.id, U.org, {
      lineupMode: 'ROTATING_LINEUPS',
      rounds: [
        { sides: [{ label: 'א׳', score: 1, players: [{ userId: U.pending, goals: 1 }] }, { label: 'ב׳', score: 0, players: [{ userId: U.p2 }] }] },
      ],
    })).rejects.toMatchObject({ status: 400, code: 'NOT_CONFIRMED_PARTICIPANT' });

    const view = await upsertGameResult(game.id, U.mgr, {
      lineupMode: 'ROTATING_LINEUPS',
      rounds: [
        {
          sides: [
            { label: 'א׳', score: 3, players: [{ userId: U.p1, goals: 2 }, { userId: U.p2, goals: 1 }] },
            { label: 'ב׳', score: 1, players: [{ userId: U.p3, goals: 1 }] },
          ],
        },
        {
          sides: [
            { label: 'א׳', score: 1, players: [{ userId: U.p1, goals: 1 }] },
            { label: 'ב׳', score: 2, players: [{ userId: U.p2, goals: 0 }, { userId: U.p3, goals: 2 }] },
          ],
        },
      ],
    });
    expect(view.result.summary.teams).toEqual([]);
    const byPlayer = Object.fromEntries(view.result.summary.players.map((p) => [p.userId, p]));
    expect(byPlayer[U.p1]).toMatchObject({ wins: 1, losses: 1, goals: 3 });
    expect(byPlayer[U.p2]).toMatchObject({ wins: 2, losses: 0, goals: 1 });
    expect(byPlayer[U.p3]).toMatchObject({ wins: 1, losses: 1, goals: 3 });
    expect(view.result.rounds[1].sides[0].players.map((p) => p.userId)).toEqual([U.p1]);

    const stats = await computeUserStats(U.p1, { sport: 'SOCCER' });
    // This game only (other tests use other games; filter by counting this player's rows here).
    const goals = await prisma.playerStatEntry.findMany({ where: { gameId: game.id, userId: U.p1 } });
    expect(goals).toHaveLength(1);
    expect(goals[0].sideId).toBeNull();
    expect(goals[0].value).toBe(3);
    expect(stats[0].games).toBeGreaterThanOrEqual(1);
    expect(stats[0].roundWins).toBeGreaterThanOrEqual(1);
  });

  test('a one-score save is stored as round 1 and reads back unchanged', async () => {
    const { game } = await makeGame();
    const first = await upsertGameResult(game.id, U.org, {
      sides: [{ label: 'Home', score: 3 }, { label: 'Away', score: 2 }],
      stats: [{ userId: U.p1, sideOrder: 0, values: { goals: 2, assists: 1 } }],
      notes: ' good game ',
    });
    expect(first.result.lineupMode).toBeNull();
    expect(first.result.sides.map((s) => [s.label, s.score, s.outcome])).toEqual([
      ['Home', 3, 'WIN'],
      ['Away', 2, 'LOSS'],
    ]);
    expect(first.result.rounds).toHaveLength(1);
    expect(first.result.rounds[0].order).toBe(1);
    expect(first.result.notes).toBe('good game');

    const round = await prisma.gameResultRound.findMany({ where: { resultId: first.result.id } });
    expect(round).toHaveLength(1);
    expect(round[0].order).toBe(1);
    const sides = await prisma.gameResultSide.findMany({ where: { resultId: first.result.id }, orderBy: { order: 'asc' } });
    expect(sides.map((s) => s.roundId)).toEqual([round[0].id, round[0].id]);
    expect(sides.map((s) => s.score)).toEqual([3, 2]);
    const stat = await prisma.playerStatEntry.findFirst({ where: { gameId: game.id, userId: U.p1, key: 'goals' } });
    expect(stat.sideId).toBe(sides[0].id);
    expect(stat.value).toBe(2);

    const again = await getGameResult(game.id, U.p1);
    expect(again.result.sides.map((s) => s.id)).toEqual(first.result.sides.map((s) => s.id));
    expect(again.result.stats.find((s) => s.userId === U.p1).values).toEqual({ goals: 2, assists: 1 });

    const single = await computeUserStats(U.p1);
    const soccer = single.find((s) => s.sport === 'SOCCER');
    // At least this one-score win is both a match win and a round win. Other tests in this file
    // may have added evenings for the same user; the one-score row itself is a WIN side.
    expect(soccer.wins).toBeGreaterThanOrEqual(1);
    expect(soccer.roundWins).toBeGreaterThanOrEqual(soccer.wins);

    // Re-running the migration backfill does not duplicate the round or change the score.
    const sql = fs.readFileSync(
      path.join(__dirname, '../prisma/migrations/20261024200000_game_result_rounds/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('INSERT INTO "GameResultRound"');
    expect(sql).not.toMatch(/DELETE FROM "GameResult"/);
    expect(sql).not.toMatch(/DELETE FROM "GameResultSide"/);
    expect(sql).not.toMatch(/DROP COLUMN "score"/);
    const before = sides.map((s) => ({ id: s.id, score: s.score, label: s.label, outcome: s.outcome }));
    await prisma.$executeRawUnsafe(`
      INSERT INTO "GameResultRound" ("id", "resultId", "order")
      SELECT 'r1_' || r."id", r."id", 1
      FROM "GameResult" r
      WHERE NOT EXISTS (SELECT 1 FROM "GameResultRound" q WHERE q."resultId" = r."id")
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "GameResultSide" s
      SET "roundId" = 'r1_' || s."resultId"
      WHERE s."roundId" IS NULL
        AND EXISTS (SELECT 1 FROM "GameResult" r WHERE r."id" = s."resultId")
    `);
    const after = await prisma.gameResultSide.findMany({ where: { resultId: first.result.id }, orderBy: { order: 'asc' } });
    expect(after.map((s) => ({ id: s.id, score: s.score, label: s.label, outcome: s.outcome }))).toEqual(before);
    expect(await prisma.gameResultRound.count({ where: { resultId: first.result.id } })).toBe(1);
  });
});
