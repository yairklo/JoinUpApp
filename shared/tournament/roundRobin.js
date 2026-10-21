// Round-robin fixtures (circle method) and group splitting with snake seeding.
const { shuffle } = require('./rng');

/**
 * Generate round-robin fixtures.
 * teamIds: team ids in seed order. options: { legs: 1 | 2, seed?, shuffle?: boolean }.
 * With `shuffle` the order is randomised deterministically from `seed` first.
 * Odd counts get a bye each round (a team sits out; listed in `byes`).
 * Returns { rounds: [{ round, matches: [{ round, leg, home, away }], bye: teamId | null }], byes: [{ round, team }] }.
 * Home/away is balanced greedily so no team's home-minus-away count drifts beyond 1 over one leg,
 * and leg 2 mirrors leg 1.
 */
function generateRoundRobin(teamIds, options = {}) {
  const legs = options.legs === 2 ? 2 : 1;
  if (options.legs !== undefined && options.legs !== 1 && options.legs !== 2) {
    throw new Error('legs must be 1 or 2');
  }
  const unique = new Set(teamIds);
  if (unique.size !== teamIds.length) throw new Error('duplicate team ids');
  const teams = options.shuffle ? shuffle(teamIds, options.seed) : teamIds.slice();
  if (teams.length < 2) return { rounds: [], byes: [] };

  const slots = teams.slice();
  if (slots.length % 2 === 1) slots.push(null); // null = bye
  const m = slots.length;
  const balance = new Map(teams.map((t) => [t, 0])); // home count - away count
  const leg1 = [];
  let ring = slots.slice(1);

  for (let r = 0; r < m - 1; r += 1) {
    const order = [slots[0], ...ring];
    const matches = [];
    let bye = null;
    for (let i = 0; i < m / 2; i += 1) {
      let a = order[i];
      let b = order[m - 1 - i];
      if (a === null || b === null) {
        bye = a === null ? b : a;
        continue;
      }
      // Alternate the orientation of the fixed team's pair, then fix imbalance greedily.
      if (i === 0 && r % 2 === 1) [a, b] = [b, a];
      const diff = balance.get(a) - balance.get(b);
      if (diff > 0 || (diff === 0 && (i + r) % 2 === 1)) [a, b] = [b, a];
      balance.set(a, balance.get(a) + 1);
      balance.set(b, balance.get(b) - 1);
      matches.push({ round: r + 1, leg: 1, home: a, away: b });
    }
    leg1.push({ round: r + 1, matches, bye });
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }

  const rounds = leg1.slice();
  if (legs === 2) {
    leg1.forEach((rd) => {
      rounds.push({
        round: rd.round + leg1.length,
        bye: rd.bye,
        matches: rd.matches.map((mt) => ({ round: rd.round + leg1.length, leg: 2, home: mt.away, away: mt.home })),
      });
    });
  }
  const byes = rounds.filter((rd) => rd.bye).map((rd) => ({ round: rd.round, team: rd.bye }));
  return { rounds, byes };
}

/** Flat list of fixtures from generateRoundRobin output. */
function flattenRounds(rr) {
  return rr.rounds.flatMap((rd) => rd.matches);
}

/**
 * Split seeded teams into groups with snake seeding: seeds 1..g go to groups 1..g,
 * seeds g+1..2g go to groups g..1, and so on, so group strength stays level.
 * teamIds: seed order (best first), or pass { shuffle: true, seed } to randomise first.
 * Returns an array of groups (arrays of team ids), group sizes differing by at most 1.
 */
function splitIntoGroups(teamIds, groupCount, options = {}) {
  if (!Number.isInteger(groupCount) || groupCount < 1) throw new Error('groupCount must be a positive integer');
  if (groupCount > teamIds.length) throw new Error('more groups than teams');
  const teams = options.shuffle ? shuffle(teamIds, options.seed) : teamIds.slice();
  const groups = Array.from({ length: groupCount }, () => []);
  teams.forEach((team, i) => {
    const row = Math.floor(i / groupCount);
    const col = i % groupCount;
    groups[row % 2 === 0 ? col : groupCount - 1 - col].push(team);
  });
  return groups;
}

/**
 * Group stage: split into groups (snake) then a round robin per group.
 * Returns [{ index, teams, rounds, byes }].
 */
function generateGroupStage(teamIds, groupCount, options = {}) {
  return splitIntoGroups(teamIds, groupCount, options).map((teams, index) => ({
    index,
    teams,
    ...generateRoundRobin(teams, { legs: options.legs }),
  }));
}

module.exports = { generateRoundRobin, flattenRounds, splitIntoGroups, generateGroupStage };
