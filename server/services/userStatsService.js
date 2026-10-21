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

const round2 = (n) => Math.round(n * 100) / 100;

/** Per-sport aggregates over a user's recorded game stats. */
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

  const bySport = new Map();
  const seenGames = new Set();
  for (const e of entries) {
    const sp = e.game?.sport;
    if (!sp) continue;
    if (!bySport.has(sp)) bySport.set(sp, { sport: sp, games: 0, wins: 0, draws: 0, losses: 0, entries: [] });
    const agg = bySport.get(sp);
    agg.entries.push({ key: e.key, value: e.value });
    if (seenGames.has(e.gameId)) continue;
    seenGames.add(e.gameId);
    agg.games += 1;
    const outcome = outcomeBySide.get(e.sideId);
    if (outcome === 'WIN') agg.wins += 1;
    else if (outcome === 'DRAW') agg.draws += 1;
    else if (outcome === 'LOSS') agg.losses += 1;
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

/** GET /users/:id/stats payload for a target the viewer is allowed to see (or the hidden stub). */
async function getUserStats(viewerId, target, { sport } = {}) {
  if (sport !== undefined && !SPORT_KEYS.includes(sport)) {
    const err = new Error('Unknown sport');
    err.status = 400;
    throw err;
  }
  const vis = await getStatsVisibility(viewerId, target);
  if (!vis.visible) return { visible: false, hiddenReason: vis.hiddenReason, sports: [] };
  return { visible: true, sports: await computeUserStats(target.id, { sport }) };
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
    wins: top.wins,
    draws: top.draws,
    losses: top.losses,
    headline,
  };
}

async function getStatsSummary(userId) {
  return buildStatsSummary(await computeUserStats(userId));
}

/**
 * Result badges for match-history cards: gameId -> { outcome, score, myStats }.
 * `score` is "mine-theirs" from the user's side. Games where the user has no stat rows are omitted.
 */
async function getResultsForGames(userId, gameIds) {
  if (!gameIds.length) return new Map();
  const entries = await prisma.playerStatEntry.findMany({
    where: { userId, gameId: { in: gameIds } },
    select: { gameId: true, sideId: true, key: true, value: true },
  });
  if (!entries.length) return new Map();
  const results = await prisma.gameResult.findMany({
    where: { gameId: { in: [...new Set(entries.map((e) => e.gameId))] } },
    select: { gameId: true, sides: { select: { id: true, order: true, score: true, outcome: true } } },
  });
  const resultByGame = new Map(results.map((r) => [r.gameId, r]));

  const out = new Map();
  for (const e of entries) {
    const r = resultByGame.get(e.gameId);
    if (!r) continue;
    let item = out.get(e.gameId);
    if (!item) {
      const sorted = [...r.sides].sort((a, b) => a.order - b.order);
      const mine = sorted.find((s) => s.id === e.sideId);
      const other = mine ? sorted.find((s) => s !== mine) : null;
      const [a, b] = mine && other ? [mine, other] : sorted;
      item = {
        outcome: mine ? mine.outcome : null,
        score: a && b ? `${a.score}-${b.score}` : null,
        myStats: {},
      };
      out.set(e.gameId, item);
    }
    item.myStats[e.key] = e.value;
  }
  return out;
}

/** Adds `result` to each history item the user has a recorded result for. Items stay otherwise untouched. */
async function attachResults(userId, games) {
  const map = await getResultsForGames(userId, games.map((g) => g.id));
  return games.map((g) => (map.has(g.id) ? { ...g, result: map.get(g.id) } : g));
}

module.exports = {
  getStatsVisibility,
  computeUserStats,
  getUserStats,
  buildStatsSummary,
  getStatsSummary,
  getResultsForGames,
  attachResults,
};
