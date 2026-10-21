// Single-elimination bracket for any number of teams (byes go to the top seeds).
const { shuffle } = require('./rng');

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Standard seed positions for a bracket of `size`: consecutive pairs are first-round matches, e.g. 8 -> [1,8,4,5,2,7,3,6]. */
function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order.slice(0, size);
}

/** 'FINAL' | 'SEMI_FINAL' | 'QUARTER_FINAL' | 'ROUND_OF_16' | 'ROUND_OF_32' ... for a 1-based round. */
function roundName(round, totalRounds) {
  const left = totalRounds - round;
  if (left === 0) return 'FINAL';
  if (left === 1) return 'SEMI_FINAL';
  if (left === 2) return 'QUARTER_FINAL';
  return `ROUND_OF_${2 ** (left + 1)}`;
}

const teamSlot = (teamId) => ({ teamId, source: null });
const byeSlot = () => ({ teamId: null, source: { type: 'BYE' } });
const groupSlot = (groupId, rank) => ({ teamId: null, source: { type: 'GROUP_RANK', groupId, rank } });
const fromMatch = (type, matchId) => ({ teamId: null, source: { type, matchId } });

/**
 * Order group-stage qualifiers into seed order: all group winners first (in group order), then runners-up, etc.
 * With the standard 1-vs-last pairing this keeps teams from the same group apart in round one whenever
 * there are at least two groups. Returns entries { groupId, rank } for generateBracket.
 */
function groupRankSeeds(groupIds, advancePerGroup) {
  const out = [];
  for (let rank = 1; rank <= advancePerGroup; rank += 1) {
    out.push(...groupIds.map((groupId) => ({ groupId, rank })));
  }
  return out;
}

/**
 * Build a bracket.
 * entries: seed-ordered list (best seed first) of team ids, or { groupId, rank } placeholders resolved later
 * with resolveGroupRanks.
 * options: { seeding: 'MANUAL' (default, entries already in seed order) | 'RANDOM' (shuffled by `seed`),
 *            seed?, thirdPlace?: boolean }.
 * Returns { size, roundCount, seeds, matches }.
 * Match: { id: 'R1M1' | 'TP', round, position, isThirdPlace, home, away, status, winnerId, loserId }.
 * Slot: { teamId: string | null, source: null | { type: 'BYE' } | { type: 'WINNER_OF'|'LOSER_OF', matchId }
 *                                                | { type: 'GROUP_RANK', groupId, rank } }.
 * Round-1 matches against a bye have status 'BYE' and their winner is already advanced.
 * A third-place match is only added when both semifinals are real matches (N >= 4).
 */
function generateBracket(entries, options = {}) {
  const n = entries.length;
  if (n < 2) throw new Error('a bracket needs at least 2 entries');
  const seeding = options.seeding || 'MANUAL';
  if (!['MANUAL', 'RANDOM'].includes(seeding)) throw new Error(`unknown seeding: ${seeding}`);
  const seeds = seeding === 'RANDOM' ? shuffle(entries, options.seed) : entries.slice();
  const ids = seeds.filter((e) => typeof e === 'string');
  if (new Set(ids).size !== ids.length) throw new Error('duplicate team ids');

  const size = nextPowerOfTwo(n);
  const roundCount = Math.log2(size);
  const slotFor = (seedNo) => {
    const entry = seeds[seedNo - 1];
    if (entry === undefined) return byeSlot();
    return typeof entry === 'string' ? teamSlot(entry) : groupSlot(entry.groupId, entry.rank);
  };

  const matches = [];
  const order = seedOrder(size);
  for (let p = 0; p < size / 2; p += 1) {
    matches.push({
      id: `R1M${p + 1}`, round: 1, position: p + 1, isThirdPlace: false,
      home: slotFor(order[2 * p]), away: slotFor(order[2 * p + 1]),
      status: 'SCHEDULED', winnerId: null, loserId: null,
    });
  }
  for (let r = 2; r <= roundCount; r += 1) {
    for (let p = 1; p <= size / 2 ** r; p += 1) {
      matches.push({
        id: `R${r}M${p}`, round: r, position: p, isThirdPlace: false,
        home: fromMatch('WINNER_OF', `R${r - 1}M${2 * p - 1}`),
        away: fromMatch('WINNER_OF', `R${r - 1}M${2 * p}`),
        status: 'SCHEDULED', winnerId: null, loserId: null,
      });
    }
  }
  const hasByeSemi = (m) => m.home.source?.type === 'BYE' || m.away.source?.type === 'BYE';
  if (options.thirdPlace && roundCount >= 2) {
    const semis = matches.filter((m) => m.round === roundCount - 1);
    if (!semis.some(hasByeSemi)) {
      matches.push({
        id: 'TP', round: roundCount, position: 2, isThirdPlace: true,
        home: fromMatch('LOSER_OF', semis[0].id), away: fromMatch('LOSER_OF', semis[1].id),
        status: 'SCHEDULED', winnerId: null, loserId: null,
      });
    }
  }

  // Auto-resolve byes: the real team (or group placeholder) moves straight on to round 2.
  const out = cloneMatches(matches);
  out.filter((m) => m.round === 1 && hasByeSemi(m)).forEach((m) => settleBye(out, m));
  return { size, roundCount, seeds, matches: out };
}

function cloneMatches(matches) {
  return matches.map((m) => ({ ...m, home: { ...m.home }, away: { ...m.away } }));
}

/** Internal: a bye match is won by its real side; copy that side into the next round's slot (mutates `all`). */
function settleBye(all, m) {
  const real = m.home.source?.type === 'BYE' ? m.away : m.home;
  m.status = 'BYE';
  m.winnerId = real.teamId;
  const next = all.find((x) => x.home.source?.matchId === m.id || x.away.source?.matchId === m.id);
  if (next) {
    const side = next.home.source?.matchId === m.id ? 'home' : 'away';
    next[side] = { teamId: real.teamId, source: next[side].source };
  }
}

/**
 * Record a result and resolve downstream slots. Pure: returns { matches, changed } (new array, changed = ids).
 * winnerId must be one of the match's teams; pass null to undo a result (clears the downstream slots it filled).
 * Throws if a downstream match has already been played, since its teams would change.
 */
function advance(matches, matchId, winnerId) {
  const m = matches.find((x) => x.id === matchId);
  if (!m) throw new Error(`unknown match ${matchId}`);
  if (m.status === 'BYE') throw new Error('cannot set a result on a bye');
  const out = cloneMatches(matches);
  const target = out.find((x) => x.id === matchId);
  const changed = [matchId];

  let loserId = null;
  if (winnerId !== null) {
    const { teamId: h } = target.home;
    const { teamId: a } = target.away;
    if (h === null || a === null) throw new Error('both teams must be known before a result');
    if (winnerId !== h && winnerId !== a) throw new Error('winner is not playing in this match');
    loserId = winnerId === h ? a : h;
  }
  target.winnerId = winnerId;
  target.loserId = loserId;
  target.status = winnerId === null ? 'SCHEDULED' : 'FINISHED';

  out.forEach((next) => {
    ['home', 'away'].forEach((side) => {
      const src = next[side].source;
      if (!src || src.matchId !== matchId) return;
      const teamId = src.type === 'WINNER_OF' ? winnerId : loserId;
      if (next[side].teamId === teamId) return;
      if (next.status === 'FINISHED') throw new Error(`downstream match ${next.id} was already played`);
      next[side] = { teamId, source: src };
      changed.push(next.id);
    });
  });
  return { matches: out, changed };
}

/**
 * Fill GROUP_RANK placeholders once the group stage is done.
 * rankings: { [groupId]: teamIds ordered by rank }. Unknown ranks stay unresolved. Returns a new matches array.
 */
function resolveGroupRanks(matches, rankings) {
  const out = cloneMatches(matches);
  out.forEach((m) => {
    ['home', 'away'].forEach((side) => {
      const src = m[side].source;
      if (src && src.type === 'GROUP_RANK') {
        const teamId = (rankings[src.groupId] || [])[src.rank - 1];
        if (teamId) m[side] = { teamId, source: src };
      }
    });
  });
  out.filter((m) => m.status === 'BYE').forEach((m) => settleBye(out, m));
  return out;
}

/** Group matches into rounds for rendering: [{ round, name, matches }]. The third-place match joins the final round. */
function getRounds(bracket) {
  const rounds = [];
  for (let r = 1; r <= bracket.roundCount; r += 1) {
    rounds.push({
      round: r,
      name: roundName(r, bracket.roundCount),
      matches: bracket.matches.filter((m) => m.round === r),
    });
  }
  return rounds;
}

module.exports = {
  nextPowerOfTwo,
  seedOrder,
  roundName,
  groupRankSeeds,
  generateBracket,
  advance,
  resolveGroupRanks,
  getRounds,
};
