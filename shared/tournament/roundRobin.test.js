const { generateRoundRobin, flattenRounds, splitIntoGroups, generateGroupStage } = require('./roundRobin');

const ids = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const key = (a, b) => [a, b].sort().join('|');

describe('generateRoundRobin', () => {
  it('returns nothing for fewer than two teams and rejects bad input', () => {
    expect(generateRoundRobin(['A']).rounds).toEqual([]);
    expect(() => generateRoundRobin(['A', 'A'])).toThrow();
    expect(() => generateRoundRobin(['A', 'B'], { legs: 3 })).toThrow();
  });

  it('property N=2..32, 1 leg: everyone meets everyone once, plays once per round, byes only when odd', () => {
    for (let n = 2; n <= 32; n += 1) {
      const teams = ids(n);
      const rr = generateRoundRobin(teams);
      const expectedRounds = n % 2 === 0 ? n - 1 : n;
      expect(rr.rounds).toHaveLength(expectedRounds);
      const seen = new Map();
      rr.rounds.forEach((rd) => {
        const inRound = new Set();
        rd.matches.forEach((m) => {
          seen.set(key(m.home, m.away), (seen.get(key(m.home, m.away)) || 0) + 1);
          expect(inRound.has(m.home) || inRound.has(m.away)).toBe(false);
          inRound.add(m.home);
          inRound.add(m.away);
        });
        if (n % 2 === 1) {
          expect(rd.bye).not.toBeNull();
          expect(inRound.has(rd.bye)).toBe(false);
          expect(inRound.size).toBe(n - 1);
        } else {
          expect(rd.bye).toBeNull();
          expect(inRound.size).toBe(n);
        }
      });
      expect(seen.size).toBe((n * (n - 1)) / 2);
      expect([...seen.values()].every((c) => c === 1)).toBe(true);
      if (n % 2 === 1) expect(new Set(rr.byes.map((b) => b.team)).size).toBe(n); // each team sits out once
    }
  });

  it('property N=2..32, 2 legs: each pair twice with home and away swapped; played counts are right', () => {
    for (let n = 2; n <= 32; n += 1) {
      const teams = ids(n);
      const matches = flattenRounds(generateRoundRobin(teams, { legs: 2 }));
      expect(matches).toHaveLength(n * (n - 1));
      const dir = new Set(matches.map((m) => `${m.home}>${m.away}`));
      expect(dir.size).toBe(n * (n - 1)); // every ordered pair exactly once
      const played = new Map(teams.map((t) => [t, 0]));
      matches.forEach((m) => {
        played.set(m.home, played.get(m.home) + 1);
        played.set(m.away, played.get(m.away) + 1);
      });
      teams.forEach((t) => expect(played.get(t)).toBe(2 * (n - 1)));
      matches.filter((m) => m.leg === 2).forEach((m) => expect(dir.has(`${m.away}>${m.home}`)).toBe(true));
    }
  });

  it('balances home/away within 1 over a single leg', () => {
    for (let n = 2; n <= 32; n += 1) {
      const bal = new Map(ids(n).map((t) => [t, 0]));
      flattenRounds(generateRoundRobin(ids(n))).forEach((m) => {
        bal.set(m.home, bal.get(m.home) + 1);
        bal.set(m.away, bal.get(m.away) - 1);
      });
      const worst = Math.max(...[...bal.values()].map(Math.abs));
      expect(worst).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic given a seed and differs across seeds when shuffling', () => {
    const a = generateRoundRobin(ids(8), { shuffle: true, seed: 3 });
    expect(generateRoundRobin(ids(8), { shuffle: true, seed: 3 })).toEqual(a);
    expect(generateRoundRobin(ids(8), { shuffle: true, seed: 4 })).not.toEqual(a);
    expect(generateRoundRobin(ids(8))).toEqual(generateRoundRobin(ids(8)));
  });
});

describe('splitIntoGroups', () => {
  it('snake seeds: 8 teams into 2 groups', () => {
    expect(splitIntoGroups(ids(8), 2)).toEqual([
      ['T1', 'T4', 'T5', 'T8'],
      ['T2', 'T3', 'T6', 'T7'],
    ]);
  });

  it('property: all teams assigned once, sizes differ by at most 1', () => {
    for (let n = 2; n <= 32; n += 1) {
      for (let g = 1; g <= Math.min(n, 8); g += 1) {
        const groups = splitIntoGroups(ids(n), g);
        expect(groups.flat().sort()).toEqual(ids(n).sort());
        const sizes = groups.map((x) => x.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects invalid group counts and shuffles deterministically', () => {
    expect(() => splitIntoGroups(ids(3), 0)).toThrow();
    expect(() => splitIntoGroups(ids(3), 4)).toThrow();
    const a = splitIntoGroups(ids(12), 3, { shuffle: true, seed: 9 });
    expect(splitIntoGroups(ids(12), 3, { shuffle: true, seed: 9 })).toEqual(a);
  });
});

describe('generateGroupStage', () => {
  it('builds a round robin per group', () => {
    const stage = generateGroupStage(ids(10), 2, { legs: 2 });
    expect(stage).toHaveLength(2);
    stage.forEach((g) => expect(flattenRounds(g)).toHaveLength(g.teams.length * (g.teams.length - 1)));
  });
});
