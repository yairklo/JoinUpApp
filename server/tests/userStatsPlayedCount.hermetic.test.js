// withPlayedCounts: the stats "games" tile counts the same past games as the match-history list,
// not only games that have recorded stat rows.
jest.mock('../lib/prisma', () => ({
  prisma: {
    game: { groupBy: jest.fn() },
    playerStatEntry: { findMany: jest.fn() },
    gameResultSide: { findMany: jest.fn() },
  },
}));

const { prisma } = require('../lib/prisma');
const { withPlayedCounts, pastGamesWhere, buildStatsSummary } = require('../services/userStatsService');

const soccerStats = { sport: 'SOCCER', games: 1, gamesWithOutcome: 1, wins: 1, draws: 0, losses: 0, totals: { goals: 2 }, perGame: { goals: 2 } };

describe('withPlayedCounts', () => {
  it('uses the history count for gamesPlayed while keeping games (per-game denominator)', async () => {
    prisma.game.groupBy.mockResolvedValue([{ sport: 'SOCCER', _count: { _all: 3 } }]);
    const [s] = await withPlayedCounts('u1', [soccerStats]);
    expect(s).toMatchObject({ games: 1, gamesPlayed: 3, perGame: { goals: 2 } });
  });

  it('adds a zeroed entry for a sport with played games but no stat rows', async () => {
    prisma.game.groupBy.mockResolvedValue([
      { sport: 'SOCCER', _count: { _all: 3 } },
      { sport: 'BASKETBALL', _count: { _all: 2 } },
    ]);
    const out = await withPlayedCounts('u1', [soccerStats]);
    expect(out.map((s) => [s.sport, s.gamesPlayed])).toEqual([['SOCCER', 3], ['BASKETBALL', 2]]);
    expect(out[1]).toMatchObject({ games: 0, wins: 0, totals: {} });
  });

  it('never reports fewer played games than games with stats', async () => {
    prisma.game.groupBy.mockResolvedValue([]);
    const [s] = await withPlayedCounts('u1', [soccerStats]);
    expect(s.gamesPlayed).toBe(1);
  });

  it('filters by the same past/non-cancelled/participant predicate as the history list', () => {
    const w = pastGamesWhere('u1', new Date('2026-10-20T00:00:00Z'));
    expect(w.status).toEqual({ not: 'CANCELLED' });
    expect(w.OR).toEqual([{ participants: { some: { userId: 'u1', status: 'CONFIRMED' } } }, { organizerId: 'u1' }]);
  });

  it('summary exposes gamesPlayed', () => {
    expect(buildStatsSummary([{ ...soccerStats, gamesPlayed: 3 }]).gamesPlayed).toBe(3);
  });
});
