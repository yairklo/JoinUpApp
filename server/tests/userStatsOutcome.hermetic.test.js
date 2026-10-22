// computeUserStats: games with no known outcome count in `games` but not in `gamesWithOutcome`,
// so wins + draws + losses === gamesWithOutcome and win rate = wins / gamesWithOutcome stays honest.
jest.mock('../lib/prisma', () => ({
  prisma: {
    playerStatEntry: { findMany: jest.fn() },
    gameResultSide: { findMany: jest.fn() },
  },
}));

const { prisma } = require('../lib/prisma');
const { computeUserStats, buildStatsSummary } = require('../services/userStatsService');

const entry = (gameId, sideId, key, value, sport = 'SOCCER') => ({ gameId, sideId, key, value, game: { sport } });

describe('computeUserStats outcome counting', () => {
  beforeEach(() => {
    prisma.playerStatEntry.findMany.mockResolvedValue([
      entry('g1', 's1', 'goals', 2),
      entry('g2', 's2', 'goals', 1),
      entry('g3', null, 'goals', 4), // no side: outcome unknown
      entry('g4', 's4', 'goals', 0), // side whose outcome was never decided
      entry('g1', 's1', 'assists', 1), // second row of the same game is not a second game
    ]);
    prisma.gameResultSide.findMany.mockResolvedValue([
      { id: 's1', outcome: 'WIN' },
      { id: 's2', outcome: 'LOSS' },
      { id: 's4', outcome: null },
    ]);
  });

  it('keeps games and per-game averages over every game, and exposes gamesWithOutcome', async () => {
    const [soccer] = await computeUserStats('u1');
    expect(soccer).toMatchObject({ sport: 'SOCCER', games: 4, gamesWithOutcome: 2, wins: 1, draws: 0, losses: 1 });
    expect(soccer.wins + soccer.draws + soccer.losses).toBe(soccer.gamesWithOutcome);
    expect(soccer.totals.goals).toBe(7);
    expect(soccer.perGame.goals).toBe(1.75);
  });

  it('counts a game once even when only a later row carries the side', async () => {
    prisma.playerStatEntry.findMany.mockResolvedValue([entry('g1', null, 'goals', 1), entry('g1', 's1', 'assists', 1)]);
    const [soccer] = await computeUserStats('u1');
    expect(soccer).toMatchObject({ games: 1, gamesWithOutcome: 1, wins: 1 });
  });

  it('exposes gamesWithOutcome in the profile summary', async () => {
    const [soccer] = await computeUserStats('u1');
    expect(buildStatsSummary([soccer])).toMatchObject({ games: 4, gamesWithOutcome: 2, wins: 1, losses: 1 });
    // older payloads without the field fall back to games
    expect(buildStatsSummary([{ sport: 'SOCCER', games: 2, wins: 1, draws: 0, losses: 1, totals: {}, perGame: {} }]).gamesWithOutcome).toBe(2);
  });
});
