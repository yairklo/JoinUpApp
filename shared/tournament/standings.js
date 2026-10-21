// Tournament standings: a pure function over finished matches (never stored).
const { shuffle } = require('./rng');

const DEFAULT_OPTIONS = {
  points: { win: 3, draw: 1, loss: 0 },
  // POINTS is always applied first; these break ties between teams level on points.
  tiebreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
  forfeitScore: { winner: 3, loser: 0 },
  rankBy: 'POINTS', // 'POINTS' | 'POINTS_PER_GAME' (fair when teams have played unequal games)
  fairPlay: {}, // teamId -> penalty points, lower is better
  seed: 0, // used by DRAW_LOT
};

function emptyRow(teamId) {
  return { teamId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

/**
 * Normalise a match to { home, away, hs, as } or null when it should not count.
 * FINISHED counts with its scores; FORFEIT gives the non-forfeiting team the configured score.
 */
function normalizeMatch(m, forfeitScore) {
  if (m.status === 'FORFEIT') {
    const forfeiter = m.forfeitBy;
    if (forfeiter !== m.homeTeamId && forfeiter !== m.awayTeamId) return null;
    const homeForfeits = forfeiter === m.homeTeamId;
    return {
      home: m.homeTeamId,
      away: m.awayTeamId,
      hs: homeForfeits ? forfeitScore.loser : forfeitScore.winner,
      as: homeForfeits ? forfeitScore.winner : forfeitScore.loser,
    };
  }
  if (m.status !== 'FINISHED') return null;
  if (!Number.isFinite(m.homeScore) || !Number.isFinite(m.awayScore)) return null;
  return { home: m.homeTeamId, away: m.awayTeamId, hs: m.homeScore, as: m.awayScore };
}

function applyMatch(rows, n, pts) {
  const h = rows.get(n.home);
  const a = rows.get(n.away);
  if (!h || !a) return;
  h.played += 1;
  a.played += 1;
  h.gf += n.hs;
  h.ga += n.as;
  a.gf += n.as;
  a.ga += n.hs;
  if (n.hs > n.as) {
    h.won += 1;
    a.lost += 1;
    h.points += pts.win;
    a.points += pts.loss;
  } else if (n.hs < n.as) {
    a.won += 1;
    h.lost += 1;
    a.points += pts.win;
    h.points += pts.loss;
  } else {
    h.drawn += 1;
    a.drawn += 1;
    h.points += pts.draw;
    a.points += pts.draw;
  }
}

function buildTable(teamIds, normalized, pts) {
  const rows = new Map(teamIds.map((id) => [id, emptyRow(id)]));
  normalized.forEach((n) => applyMatch(rows, n, pts));
  rows.forEach((r) => {
    r.gd = r.gf - r.ga;
  });
  return rows;
}

const sameKey = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

/** Group items into buckets of equal key (an array of numbers), buckets ordered best (largest) first. */
function bucketByKeyDesc(items, keyOf) {
  const keyed = items.map((item) => ({ item, key: keyOf(item) }));
  const distinct = [];
  keyed.forEach(({ key }) => {
    if (!distinct.some((k) => sameKey(k, key))) distinct.push(key);
  });
  distinct.sort((x, y) => {
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  });
  return distinct.map((key) => keyed.filter((k) => sameKey(k.key, key)).map((k) => k.item));
}

/**
 * Order a group of teams level on the primary ranking value.
 * After a criterion splits the group, each smaller subgroup restarts from the first criterion
 * (head-to-head is re-evaluated over just the remaining teams: the 3+ way mini-table rule).
 */
function resolveTies(group, idx, ctx) {
  if (group.length < 2) return group.map((id) => ({ id, tied: false }));
  if (idx >= ctx.tiebreak.length) {
    if (ctx.tiebreak.includes('DRAW_LOT')) return shuffle(group, ctx.seed).map((id) => ({ id, tied: false }));
    return group.map((id) => ({ id, tied: true }));
  }
  const criterion = ctx.tiebreak[idx];
  let keyOf;
  if (criterion === 'HEAD_TO_HEAD') {
    const set = new Set(group);
    const mini = buildTable(group, ctx.normalized.filter((n) => set.has(n.home) && set.has(n.away)), ctx.pts);
    keyOf = (id) => {
      const r = mini.get(id);
      return [r.points, r.gd, r.gf];
    };
  } else if (criterion === 'GOAL_DIFFERENCE') keyOf = (id) => [ctx.rows.get(id).gd];
  else if (criterion === 'GOALS_FOR') keyOf = (id) => [ctx.rows.get(id).gf];
  else if (criterion === 'WINS') keyOf = (id) => [ctx.rows.get(id).won];
  else if (criterion === 'FAIR_PLAY') keyOf = (id) => [-(ctx.fairPlay[id] || 0)];
  else return resolveTies(group, idx + 1, ctx); // DRAW_LOT / unknown: handled at the end
  const buckets = bucketByKeyDesc(group, keyOf);
  if (buckets.length === 1) return resolveTies(group, idx + 1, ctx);
  return buckets.flatMap((b) => resolveTies(b, 0, ctx));
}

/**
 * Compute the table.
 * teamIds: teams in the table (order is the stable fallback order for unresolved ties).
 * matches: { homeTeamId, awayTeamId, homeScore, awayScore, status, forfeitBy? }; only FINISHED and FORFEIT count.
 * Returns rows best first: { rank, teamId, played, won, drawn, lost, gf, ga, gd, points, pointsPerGame, fairPlay, tied }.
 * `tied: true` means the configured tiebreakers could not separate the team from a neighbour (rank is still distinct).
 */
function computeStandings(teamIds, matches, options = {}) {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    points: { ...DEFAULT_OPTIONS.points, ...(options.points || {}) },
    forfeitScore: { ...DEFAULT_OPTIONS.forfeitScore, ...(options.forfeitScore || {}) },
  };
  const normalized = (matches || []).map((m) => normalizeMatch(m, opts.forfeitScore)).filter(Boolean);
  const rows = buildTable(teamIds, normalized, opts.points);
  const primary = (id) => {
    const r = rows.get(id);
    return opts.rankBy === 'POINTS_PER_GAME' ? (r.played ? r.points / r.played : 0) : r.points;
  };
  const ctx = {
    rows,
    normalized,
    pts: opts.points,
    tiebreak: opts.tiebreak,
    fairPlay: opts.fairPlay,
    seed: opts.seed,
  };
  const ordered = bucketByKeyDesc(teamIds, (id) => [primary(id)]).flatMap((b) => resolveTies(b, 0, ctx));
  return ordered.map(({ id, tied }, i) => {
    const r = rows.get(id);
    return {
      rank: i + 1,
      ...r,
      pointsPerGame: r.played ? r.points / r.played : 0,
      fairPlay: opts.fairPlay[id] || 0,
      tied,
    };
  });
}

module.exports = { DEFAULT_OPTIONS, computeStandings };
