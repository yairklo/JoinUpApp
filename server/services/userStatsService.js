const { prisma } = require('../lib/prisma');
const { resolvePrivacyLevel, areConfirmedFriends, canViewSection } = require('../utils/privacy');
const { SPORT_KEYS } = require('../shared/sports');
const { aggregateStats, getSummaryKeys } = require('../shared/matchStats');

const HEADLINE_STATS = 3;

/**
 * Whether `viewerId` may see `target`'s match stats. Owner always; otherwise hidden when the
 * target opted out (hideMatchStats) or the games section is not visible to the viewer
 * (privacyGames, minors default to friends-only).
 * `target` needs { id, birthDate, privacyGames, hideMatchStats }.
 */
async function getStatsVisibility(viewerId, target, { isFriend } = {}) {
  const isOwner = !!viewerId && viewerId === target.id;
  if (isOwner) return { visible: true, isOwner };
  if (target.hideMatchStats) return { visible: false, hiddenReason: 'USER_HIDDEN', isOwner };
  const friend = isFriend !== undefined ? isFriend : viewerId ? await areConfirmedFriends(viewerId, target.id) : false;
  const effGames = resolvePrivacyLevel(target.privacyGames, target.birthDate);
  if (!canViewSection({ effectivePrivacy: effGames, isOwner, isFriend: friend })) {
    return { visible: false, hiddenReason: 'PRIVATE', isOwner };
  }
  return { visible: true, isOwner };
}

/** Past, non-cancelled games a user took part in (or organised): the match-history set. */
function pastGamesWhere(userId, now = new Date()) {
  return {
    start: { lt: now },
    status: { not: 'CANCELLED' },
    OR: [
      { participants: { some: { userId, status: 'CONFIRMED' } } },
      { organizerId: userId },
    ],
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Profile stat policy for multi-round evenings (docs/plans/2026-10-multi-round-results.md):
 * - `games` counts the evening once, never once per round.
 * - `wins` / `draws` / `losses` are match results. A game contributes one of them only when it
 *   has a single round (every historical result and every new one-score save). A multi-round
 *   evening has no single winner, so it does not change these and does not increment
 *   `gamesWithOutcome`.
 * - `roundWins` / `roundDraws` / `roundLosses` count each round the player took part in.
 *   A single-round game contributes one round outcome too, so the counters match until an
 *   evening with several rounds is recorded.
 * - Goal totals stay the sum of PlayerStatEntry (one row per player per game, summed across rounds).
 */
function emptyAgg(sport) {
  return {
    sport,
    games: 0,
    gamesWithOutcome: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    roundWins: 0,
    roundDraws: 0,
    roundLosses: 0,
    entries: [],
  };
}

function countOutcome(agg, outcome, matchOutcomeByGame, gameId) {
  matchOutcomeByGame.set(gameId, outcome);
  agg.gamesWithOutcome += 1;
  if (outcome === 'WIN') agg.wins += 1;
  else if (outcome === 'DRAW') agg.draws += 1;
  else agg.losses += 1;
}

function undoOutcome(agg, outcome, matchOutcomeByGame, gameId) {
  if (!matchOutcomeByGame.has(gameId)) return;
  matchOutcomeByGame.delete(gameId);
  agg.gamesWithOutcome = Math.max(0, agg.gamesWithOutcome - 1);
  if (outcome === 'WIN') agg.wins = Math.max(0, agg.wins - 1);
  else if (outcome === 'DRAW') agg.draws = Math.max(0, agg.draws - 1);
  else agg.losses = Math.max(0, agg.losses - 1);
}

function addRound(agg, outcome) {
  if (outcome === 'WIN') agg.roundWins += 1;
  else if (outcome === 'DRAW') agg.roundDraws += 1;
  else if (outcome === 'LOSS') agg.roundLosses += 1;
}

function isKnownOutcome(outcome) {
  return outcome === 'WIN' || outcome === 'DRAW' || outcome === 'LOSS';
}

/**
 * Per-sport aggregates over a user's recorded game stats.
 * Response shape per sport: { sport, games, gamesWithOutcome, wins, draws, losses,
 * roundWins, roundDraws, roundLosses, totals, perGame }.
 */
async function computeUserStats(userId, { sport } = {}) {
  const entries = await prisma.playerStatEntry.findMany({
    where: { userId, gameId: { not: null }, ...(sport ? { game: { sport } } : {}) },
    select: { gameId: true, sideId: true, key: true, value: true, game: { select: { sport: true } } },
  });
  const sideIds = [...new Set(entries.map((e) => e.sideId).filter(Boolean))];
  const sides = sideIds.length
    ? await prisma.gameResultSide.findMany({ where: { id: { in: sideIds } }, select: { id: true, outcome: true } })
    : [];
  const outcomeBySide = new Map(sides.map((s) => [s.id, s.outcome]));
  // Absent on hermetic mocks that predate round rows. Real Prisma always has the delegate.
  const roundRows = typeof prisma.gameResultRoundPlayer?.findMany === 'function'
    ? await prisma.gameResultRoundPlayer.findMany({
        where: {
          userId,
          ...(sport ? { side: { round: { result: { game: { sport } } } } } : {}),
        },
        select: {
          side: {
            select: {
              outcome: true,
              round: {
                select: {
                  id: true,
                  result: {
                    select: {
                      gameId: true,
                      game: { select: { sport: true } },
                      _count: { select: { rounds: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const bySport = new Map();
  const seenGames = new Set();
  const matchOutcomeByGame = new Map();
  const sportByGame = new Map();
  for (const e of entries) {
    const sp = e.game?.sport;
    if (!sp) continue;
    sportByGame.set(e.gameId, sp);
    if (!bySport.has(sp)) bySport.set(sp, emptyAgg(sp));
    const agg = bySport.get(sp);
    agg.entries.push({ key: e.key, value: e.value });
    const outcome = outcomeBySide.get(e.sideId);
    const known = isKnownOutcome(outcome);
    // `games` counts every game with stats (per-game averages use it); `gamesWithOutcome` counts only
    // games whose W/D/L is known, so wins + draws + losses === gamesWithOutcome (use it for win rate).
    // A game is counted once, upgraded to "known" if any of its rows carries a side with an outcome.
    if (seenGames.has(e.gameId)) {
      if (known && !matchOutcomeByGame.has(e.gameId)) countOutcome(agg, outcome, matchOutcomeByGame, e.gameId);
      continue;
    }
    seenGames.add(e.gameId);
    agg.games += 1;
    if (known) countOutcome(agg, outcome, matchOutcomeByGame, e.gameId);
  }

  const roundByGame = new Map();
  for (const row of roundRows) {
    const result = row.side?.round?.result;
    const gameId = result?.gameId;
    const sp = result?.game?.sport;
    const roundId = row.side?.round?.id;
    if (!gameId || !sp || !roundId) continue;
    sportByGame.set(gameId, sp);
    if (!roundByGame.has(gameId)) {
      roundByGame.set(gameId, { sport: sp, total: result._count?.rounds ?? 1, rounds: new Map() });
    }
    const info = roundByGame.get(gameId);
    if (!info.rounds.has(roundId)) info.rounds.set(roundId, row.side.outcome);
  }
  for (const [gameId, info] of roundByGame) {
    if (!bySport.has(info.sport)) bySport.set(info.sport, emptyAgg(info.sport));
    const agg = bySport.get(info.sport);
    if (!seenGames.has(gameId)) {
      seenGames.add(gameId);
      agg.games += 1;
    }
    for (const outcome of info.rounds.values()) addRound(agg, outcome);
    if (info.total > 1 && matchOutcomeByGame.has(gameId)) {
      undoOutcome(agg, matchOutcomeByGame.get(gameId), matchOutcomeByGame, gameId);
    } else if (info.total <= 1 && !matchOutcomeByGame.has(gameId)) {
      const known = [...info.rounds.values()].find(isKnownOutcome);
      if (known) countOutcome(agg, known, matchOutcomeByGame, gameId);
    }
  }
  for (const [gameId, outcome] of matchOutcomeByGame) {
    if (roundByGame.has(gameId)) continue;
    const agg = bySport.get(sportByGame.get(gameId));
    if (agg) addRound(agg, outcome);
  }

  return [...bySport.values()]
    .sort((a, b) => b.games - a.games || a.sport.localeCompare(b.sport))
    .map(({ entries: list, ...agg }) => {
      const totals = aggregateStats(list);
      const perGame = {};
      for (const [k, v] of Object.entries(totals)) perGame[k] = round2(v / agg.games);
      return { ...agg, totals, perGame };
    });
}

/**
 * Adds `gamesPlayed` (the match-history count, same filter as the profile list) to each sport.
 * `games` stays "games with recorded stats" because per-game averages divide by it. Sports with played
 * games but no stat rows get a zeroed entry so the tile and the history list agree.
 */
async function withPlayedCounts(userId, sports, { sport } = {}) {
  const grouped = await prisma.game.groupBy({
    by: ['sport'],
    where: { ...pastGamesWhere(userId), ...(sport ? { sport } : {}) },
    _count: { _all: true },
  });
  const played = new Map(grouped.map((g) => [g.sport, g._count._all]));
  const out = sports.map((s) => ({ ...s, gamesPlayed: Math.max(played.get(s.sport) || 0, s.games) }));
  for (const [sp, count] of played) {
    if (!sp || out.some((s) => s.sport === sp)) continue;
    out.push({
      sport: sp,
      games: 0,
      gamesWithOutcome: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      roundWins: 0,
      roundDraws: 0,
      roundLosses: 0,
      totals: {},
      perGame: {},
      gamesPlayed: count,
    });
  }
  return out.sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.sport.localeCompare(b.sport));
}

/** GET /users/:id/stats payload for a target the viewer is allowed to see (or the hidden stub). */
async function getUserStats(viewerId, target, { sport } = {}) {
  if (sport !== undefined && !SPORT_KEYS.includes(sport)) {
    const err = new Error('Unknown sport');
    err.status = 400;
    throw err;
  }
  const vis = await getStatsVisibility(viewerId, target);
  if (!vis.visible) return { visible: false, hiddenReason: vis.hiddenReason, sports: [] };
  const payload = { visible: true, sports: await withPlayedCounts(target.id, await computeUserStats(target.id, { sport }), { sport }) };
  // Only the owner ever sees their own stats while hidden from everyone else.
  if (vis.isOwner && target.hideMatchStats) payload.ownerHidden = true;
  return payload;
}

/** Compact block for the profile hero: W/D/L plus a few headline stats of the most played sport. */
function buildStatsSummary(sports) {
  const top = sports && sports[0];
  if (!top) return null;
  const headline = getSummaryKeys(top.sport)
    .filter((key) => top.totals[key] !== undefined)
    .slice(0, HEADLINE_STATS)
    .map((key) => ({ key, total: top.totals[key], perGame: top.perGame[key] }));
  return {
    sport: top.sport,
    games: top.games,
    gamesPlayed: top.gamesPlayed ?? top.games,
    gamesWithOutcome: top.gamesWithOutcome ?? top.games,
    wins: top.wins,
    draws: top.draws,
    losses: top.losses,
    roundWins: top.roundWins ?? 0,
    roundDraws: top.roundDraws ?? 0,
    roundLosses: top.roundLosses ?? 0,
    headline,
  };
}

async function getStatsSummary(userId) {
  return buildStatsSummary(await withPlayedCounts(userId, await computeUserStats(userId)));
}

/**
 * Result badges for match-history cards: gameId -> { outcome, score, myStats }.
 * `score` is "mine-theirs" from the user's side. The side comes from the user's stat rows, or, when they
 * have none, from their Participation.teamId matching a GameResultSide.teamId (myStats is then {}).
 * Games where the user's side is unknown and they have no stat rows are omitted.
 */
async function getResultsForGames(userId, gameIds) {
  if (!gameIds.length) return new Map();
  const [entries, participations] = await Promise.all([
    prisma.playerStatEntry.findMany({
      where: { userId, gameId: { in: gameIds } },
      select: { gameId: true, sideId: true, key: true, value: true },
    }),
    prisma.participation.findMany({
      where: { userId, gameId: { in: gameIds }, status: 'CONFIRMED', teamId: { not: null } },
      select: { gameId: true, teamId: true },
    }),
  ]);
  const teamByGame = new Map(participations.map((p) => [p.gameId, p.teamId]));
  const candidateGames = [...new Set([...entries.map((e) => e.gameId), ...teamByGame.keys()])];
  if (!candidateGames.length) return new Map();
  const results = await prisma.gameResult.findMany({
    where: { gameId: { in: candidateGames } },
    select: {
      gameId: true,
      rounds: {
        orderBy: { order: 'asc' },
        select: {
          sides: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              score: true,
              outcome: true,
              teamId: true,
              players: { where: { userId }, select: { goals: true } },
            },
          },
        },
      },
      sides: { select: { id: true, order: true, score: true, outcome: true, teamId: true } },
    },
  });
  const resultByGame = new Map(results.map((r) => [r.gameId, r]));

  const singleSides = (r) => (r.rounds?.[0]?.sides?.length ? r.rounds[0].sides : [...r.sides].sort((a, b) => a.order - b.order));
  const multi = (r) => (r.rounds?.length || 0) > 1;

  const badge = (r, mineId, teamId) => {
    const sorted = singleSides(r);
    const mine = sorted.find((s) => s.id === mineId) || (teamId ? sorted.find((s) => s.teamId === teamId) : undefined);
    const other = mine ? sorted.find((s) => s !== mine) : null;
    const [a, b] = mine && other ? [mine, other] : sorted;
    return { outcome: mine ? mine.outcome : null, score: a && b ? `${a.score}-${b.score}` : null, myStats: {} };
  };

  // Several rounds have no single match score. The badge carries the round record instead.
  const roundBadge = (r, teamId) => {
    const record = { wins: 0, draws: 0, losses: 0 };
    for (const round of r.rounds) {
      const side = round.sides.find((s) => (s.players || []).length)
        || (teamId ? round.sides.find((s) => s.teamId === teamId) : undefined);
      if (!side) continue;
      if (side.outcome === 'WIN') record.wins += 1;
      else if (side.outcome === 'DRAW') record.draws += 1;
      else if (side.outcome === 'LOSS') record.losses += 1;
    }
    return { outcome: null, score: null, myStats: {}, rounds: record };
  };

  const out = new Map();
  for (const e of entries) {
    const r = resultByGame.get(e.gameId);
    if (!r) continue;
    let item = out.get(e.gameId);
    if (!item) {
      item = multi(r) ? roundBadge(r, teamByGame.get(e.gameId)) : badge(r, e.sideId, teamByGame.get(e.gameId));
      out.set(e.gameId, item);
    }
    item.myStats[e.key] = e.value;
  }
  for (const [gameId, teamId] of teamByGame) {
    const r = resultByGame.get(gameId);
    if (out.has(gameId) || !r) continue;
    if (multi(r)) {
      const item = roundBadge(r, teamId);
      if (item.rounds.wins + item.rounds.draws + item.rounds.losses > 0) out.set(gameId, item);
      continue;
    }
    const item = badge(r, null, teamId);
    if (item.outcome) out.set(gameId, item); // no badge when the team matches no side
  }
  return out;
}

/** Adds `result` to each history item the user has a recorded result for. Items stay otherwise untouched. */
async function attachResults(userId, games) {
  const map = await getResultsForGames(userId, games.map((g) => g.id));
  return games.map((g) => (map.has(g.id) ? { ...g, result: map.get(g.id) } : g));
}

module.exports = {
  pastGamesWhere,
  withPlayedCounts,
  getStatsVisibility,
  computeUserStats,
  getUserStats,
  buildStatsSummary,
  getStatsSummary,
  getResultsForGames,
  attachResults,
};
