const { computeStandings } = require('./standings');

const fin = (h, a, hs, as) => ({ homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, status: 'FINISHED' });
const order = (rows) => rows.map((r) => r.teamId);

describe('computeStandings', () => {
  it('computes points, W/D/L and goals', () => {
    const rows = computeStandings(['A', 'B', 'C'], [fin('A', 'B', 2, 1), fin('B', 'C', 0, 0), fin('C', 'A', 1, 3)]);
    expect(order(rows)).toEqual(['A', 'B', 'C']);
    expect(rows[0]).toMatchObject({ teamId: 'A', played: 2, won: 2, points: 6, gf: 5, ga: 2, gd: 3, rank: 1 });
    expect(rows[1]).toMatchObject({ teamId: 'B', played: 2, won: 0, drawn: 1, lost: 1, points: 1, gd: -1 });
  });

  it('supports configurable points and ignores unfinished matches', () => {
    const rows = computeStandings(['A', 'B'], [fin('A', 'B', 1, 1), { ...fin('A', 'B', 5, 0), status: 'SCHEDULED' }], {
      points: { win: 2, draw: 1, loss: 0 },
    });
    expect(rows.map((r) => r.points)).toEqual([1, 1]);
    expect(rows[0].played).toBe(1);
  });

  it('breaks a two-way tie by head-to-head before goal difference', () => {
    // A: W B, L C, W D = 6. B: L A, W C, W D = 6 with a far better GD. C: W A, L B, D D = 4.
    const matches = [
      fin('A', 'B', 1, 0), fin('B', 'C', 9, 0), fin('C', 'A', 1, 0),
      fin('A', 'D', 1, 0), fin('B', 'D', 1, 0), fin('C', 'D', 0, 0),
    ];
    expect(order(computeStandings(['A', 'B', 'C', 'D'], matches)).slice(0, 2)).toEqual(['A', 'B']);
  });

  it('uses a head-to-head mini-table for a 3-way tie', () => {
    // X beat Y 3-0, Y beat Z 1-0, Z beat X 1-0: all on 3 points. Mini GD: X +2, Z 0, Y -2.
    const matches = [fin('X', 'Y', 3, 0), fin('Y', 'Z', 1, 0), fin('Z', 'X', 1, 0)];
    const rows = computeStandings(['X', 'Y', 'Z'], matches, { tiebreak: ['HEAD_TO_HEAD'] });
    expect(order(rows)).toEqual(['X', 'Z', 'Y']);
    expect(rows.every((r) => !r.tied)).toBe(true);
  });

  it('only mini-tables the tied teams and flags a perfect circle as tied', () => {
    const matches = [
      fin('A', 'B', 1, 0), fin('B', 'C', 1, 0), fin('C', 'A', 1, 0),
      fin('A', 'D', 0, 0), fin('B', 'D', 0, 0), fin('C', 'D', 0, 0),
    ];
    const rows = computeStandings(['A', 'B', 'C', 'D'], matches, { tiebreak: ['HEAD_TO_HEAD'] });
    expect(rows[3].teamId).toBe('D');
    expect(rows.slice(0, 3).every((r) => r.tied)).toBe(true);
  });

  it('flags unresolved ties, or resolves them by seeded lot deterministically', () => {
    expect(computeStandings(['A', 'B'], [fin('A', 'B', 1, 1)]).every((r) => r.tied)).toBe(true);
    const ids = ['A', 'B', 'C', 'D'];
    const lot1 = computeStandings(ids, [], { tiebreak: ['DRAW_LOT'], seed: 5 });
    const lot2 = computeStandings(ids, [], { tiebreak: ['DRAW_LOT'], seed: 5 });
    expect(order(lot1)).toEqual(order(lot2));
    expect(lot1.every((r) => !r.tied)).toBe(true);
  });

  it('applies forfeits with the configured score', () => {
    const m = { homeTeamId: 'A', awayTeamId: 'B', status: 'FORFEIT', forfeitBy: 'A' };
    const rows = computeStandings(['A', 'B'], [m]);
    expect(rows[0]).toMatchObject({ teamId: 'B', points: 3, gf: 3, ga: 0 });
    expect(computeStandings(['A', 'B'], [m], { forfeitScore: { winner: 5, loser: 0 } })[0].gf).toBe(5);
  });

  it('handles unequal games played, optionally ranking by points per game', () => {
    const matches = [fin('A', 'C', 1, 0), fin('B', 'C', 1, 0), fin('B', 'D', 1, 0)];
    expect(order(computeStandings(['A', 'B', 'C', 'D'], matches))[0]).toBe('B');
    const ppg = computeStandings(['A', 'B', 'C', 'D'], [fin('A', 'C', 1, 0), fin('B', 'C', 1, 0), fin('B', 'D', 0, 1)], {
      rankBy: 'POINTS_PER_GAME',
    });
    expect(ppg.find((r) => r.teamId === 'B').rank).toBe(3);
    expect(ppg.find((r) => r.teamId === 'A').pointsPerGame).toBe(3);
  });

  it('uses fair play (lower is better) when listed', () => {
    const rows = computeStandings(['A', 'B'], [fin('A', 'B', 0, 0)], {
      tiebreak: ['FAIR_PLAY'],
      fairPlay: { A: 4, B: 1 },
    });
    expect(order(rows)).toEqual(['B', 'A']);
  });

  it('property: full round robin for N=2..32 gives consistent totals and distinct ordered ranks', () => {
    for (let n = 2; n <= 32; n += 1) {
      const ids = Array.from({ length: n }, (_, i) => `T${i}`);
      const matches = [];
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) matches.push(fin(ids[i], ids[j], (i * 7 + j) % 4, (i + j * 3) % 4));
      }
      const rows = computeStandings(ids, matches);
      expect(rows.map((r) => r.rank)).toEqual(ids.map((_, i) => i + 1));
      expect(rows.every((r) => r.played === n - 1)).toBe(true);
      expect(rows.reduce((s, r) => s + r.gf, 0)).toBe(rows.reduce((s, r) => s + r.ga, 0));
      for (let i = 1; i < rows.length; i += 1) expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points);
    }
  });
});
