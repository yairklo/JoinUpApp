const { SPORT_KEYS } = require('./sports');
const m = require('./matchStats');

describe('schemas', () => {
  it('covers every sport with unique keys, labels and positive caps', () => {
    for (const s of SPORT_KEYS) {
      const defs = m.getStatDefs(s);
      expect(defs.length).toBeGreaterThan(0);
      expect(new Set(defs.map((d) => d.key)).size).toBe(defs.length);
      for (const d of defs) {
        expect(d.he).toBeTruthy();
        expect(d.en).toBeTruthy();
        expect(d.max).toBeGreaterThan(0);
      }
    }
  });
  it('exposes keys, summary keys and labels', () => {
    expect(m.getStatKeys('SOCCER')).toEqual(['goals', 'assists', 'saves', 'cleanSheet', 'yellowCards', 'redCards', 'ownGoals', 'mvp']);
    expect(m.getSummaryKeys('SOCCER')).toEqual(['goals', 'assists', 'mvp']);
    expect(m.getSummaryKeys('TENNIS')).toEqual(['aces']);
    expect(m.getStatLabel('SOCCER', 'goals', 'he')).toBe('שערים');
    expect(m.getStatLabel('SOCCER', 'goals')).toBe('Goals');
    expect(m.getStatLabel('SOCCER', 'nope')).toBe('nope');
    expect(m.getStatDefs('CHESS')).toEqual([]);
  });
});

describe('validateStats', () => {
  it('accepts valid stats including zeros', () => {
    const r = m.validateStats('SOCCER', { goals: 2, assists: 0, mvp: 1 });
    expect(r).toEqual({ valid: true, errors: [], stats: { goals: 2, assists: 0, mvp: 1 } });
  });
  it('rejects unknown keys, including keys of other sports', () => {
    const r = m.validateStats('SOCCER', { points: 3 });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual([{ code: 'UNKNOWN_KEY', key: 'points' }]);
  });
  it('rejects non-integers, negatives, over-cap', () => {
    const r = m.validateStats('BASKETBALL', { points: 1.5, rebounds: -1, fouls: 11, assists: '3' });
    expect(r.errors.map((e) => e.code).sort()).toEqual(['NEGATIVE', 'NOT_INT', 'NOT_INT', 'TOO_LARGE']);
    expect(r.stats).toEqual({});
  });
  it('allows a value equal to the cap, rejects above it', () => {
    expect(m.validateStats('SOCCER', { cleanSheet: 1 }).valid).toBe(true);
    expect(m.validateStats('SOCCER', { cleanSheet: 2 }).valid).toBe(false);
  });
  it('handles bad sport / bad input', () => {
    expect(m.validateStats('CHESS', {}).errors[0].code).toBe('UNKNOWN_SPORT');
    expect(m.validateStats('SOCCER', null).errors[0].code).toBe('INVALID_STATS');
    expect(m.validateStats('SOCCER', []).errors[0].code).toBe('INVALID_STATS');
  });
});

describe('deriveOutcome', () => {
  it('derives WIN/LOSS/DRAW', () => {
    expect(m.deriveOutcome(3, 1)).toBe('WIN');
    expect(m.deriveOutcome(1, 3)).toBe('LOSS');
    expect(m.deriveOutcome(2, 2)).toBe('DRAW');
    expect(m.deriveOutcome(0, 0)).toBe('DRAW');
  });
});

describe('validateTennisSets', () => {
  it('accepts straight sets and derives winner', () => {
    const r = m.validateTennisSets([[6, 4], [6, 0]]);
    expect(r).toMatchObject({ valid: true, setsWon: [2, 0], gamesWon: [12, 4], winner: 0 });
  });
  it('accepts 7-5 and 7-6', () => {
    expect(m.validateTennisSets([[7, 5], [6, 7], [7, 6]]).winner).toBe(0);
    expect(m.validateTennisSets([[5, 7], [6, 7]]).winner).toBe(1);
  });
  it('accepts a match tiebreak as deciding set; its points are not games', () => {
    const r = m.validateTennisSets([[6, 4], [3, 6], [10, 7]]);
    expect(r).toMatchObject({ valid: true, setsWon: [2, 1], gamesWon: [9, 10], winner: 0 });
    expect(m.validateTennisSets([[6, 4], [3, 6], [11, 13]]).winner).toBe(1);
    expect(m.validateTennisSets([[6, 4], [3, 6], [10, 8]]).valid).toBe(true);
  });
  it('rejects invalid match tiebreaks', () => {
    expect(m.validateTennisSets([[6, 4], [3, 6], [10, 9]]).valid).toBe(false);
    expect(m.validateTennisSets([[6, 4], [3, 6], [12, 9]]).valid).toBe(false);
    expect(m.validateTennisSets([[6, 4], [3, 6], [9, 7]]).valid).toBe(false);
  });
  it('rejects a match tiebreak that is not the deciding set', () => {
    expect(m.validateTennisSets([[10, 7], [6, 4]]).valid).toBe(false);
  });
  it('rejects illegal set scores', () => {
    for (const s of [[6, 5], [7, 4], [8, 6], [6, 6], [5, 4], [7, 7]]) {
      expect(m.validateTennisSets([s, [6, 0]]).errors[0].code).toBe('INVALID_SET_SCORE');
    }
  });
  it('rejects incomplete matches and sets after the end', () => {
    expect(m.validateTennisSets([[6, 4]]).errors[0].code).toBe('MATCH_INCOMPLETE');
    expect(m.validateTennisSets([[6, 4], [6, 4], [6, 0]]).errors[0].code).toBe('SETS_AFTER_MATCH_END');
  });
  it('rejects malformed input', () => {
    expect(m.validateTennisSets(undefined).errors[0].code).toBe('NO_SETS');
    expect(m.validateTennisSets([]).errors[0].code).toBe('NO_SETS');
    expect(m.validateTennisSets([[6]]).errors[0].code).toBe('INVALID_SET');
    expect(m.validateTennisSets([[6, -1]]).errors[0].code).toBe('INVALID_SET');
    expect(m.validateTennisSets([[6, 4]], { bestOf: 4 }).errors[0].code).toBe('INVALID_BEST_OF');
    expect(m.validateTennisSets([[6, 4], [6, 4], [6, 4], [6, 4]]).errors[0].code).toBe('TOO_MANY_SETS');
  });
  it('supports best of 5', () => {
    const sets = [[6, 4], [4, 6], [6, 3], [3, 6], [7, 6]];
    expect(m.validateTennisSets(sets, { bestOf: 5 })).toMatchObject({ valid: true, winner: 0, setsWon: [3, 2] });
    expect(m.validateTennisSets([[6, 4], [6, 4]], { bestOf: 5 }).errors[0].code).toBe('MATCH_INCOMPLETE');
  });
});

describe('validateResult', () => {
  it('derives outcomes for team sports', () => {
    expect(m.validateResult('SOCCER', { scores: [3, 1] })).toMatchObject({ valid: true, outcomes: ['WIN', 'LOSS'] });
    expect(m.validateResult('BASKETBALL', { scores: [80, 80] }).outcomes).toEqual(['DRAW', 'DRAW']);
  });
  it('rejects bad scores', () => {
    expect(m.validateResult('SOCCER', { scores: [1] }).errors[0].code).toBe('INVALID_SCORES');
    expect(m.validateResult('SOCCER', { scores: [-1, 2] }).errors[0].code).toBe('NEGATIVE');
    expect(m.validateResult('SOCCER', { scores: [1.5, 2] }).errors[0].code).toBe('NOT_INT');
    expect(m.validateResult('SOCCER', { scores: [100, 2] }).errors[0].code).toBe('TOO_LARGE');
    expect(m.validateResult('BASKETBALL', { scores: [100, 301] }).errors[0]).toMatchObject({ code: 'TOO_LARGE', index: 1 });
    expect(m.validateResult('SOCCER', null).errors[0].code).toBe('INVALID_RESULT');
    expect(m.validateResult('CHESS', { scores: [1, 0] }).errors[0].code).toBe('UNKNOWN_SPORT');
  });
  it('handles tennis', () => {
    const r = m.validateResult('TENNIS', { sets: [[6, 4], [3, 6], [10, 7]] });
    expect(r).toMatchObject({ valid: true, scores: [2, 1], outcomes: ['WIN', 'LOSS'], winner: 0 });
    expect(m.validateResult('TENNIS', { sets: [[6, 5]] }).valid).toBe(false);
  });
});

describe('checkPlayerTotals', () => {
  it('warns when player goals exceed the team score', () => {
    expect(m.checkPlayerTotals('SOCCER', 2, [{ goals: 2 }, { goals: 1 }])).toEqual([
      { code: 'PLAYER_SUM_EXCEEDS_SCORE', key: 'goals', sum: 3, teamScore: 2 },
    ]);
  });
  it('does not warn when equal, fewer, or empty', () => {
    expect(m.checkPlayerTotals('SOCCER', 3, [{ goals: 2 }, { goals: 1 }])).toEqual([]);
    expect(m.checkPlayerTotals('SOCCER', 3, [{ goals: 1 }, { assists: 5 }])).toEqual([]);
    expect(m.checkPlayerTotals('SOCCER', 0, [])).toEqual([]);
    expect(m.checkPlayerTotals('SOCCER', 0, undefined)).toEqual([]);
  });
  it('uses points for basketball and ignores tennis', () => {
    expect(m.checkPlayerTotals('BASKETBALL', 50, [{ points: 30 }, { points: 25 }])[0].key).toBe('points');
    expect(m.checkPlayerTotals('TENNIS', 0, [{ aces: 5 }])).toEqual([]);
  });
});

describe('aggregateStats', () => {
  it('sums per key', () => {
    expect(m.aggregateStats([{ key: 'goals', value: 2 }, { key: 'goals', value: 1 }, { key: 'assists', value: 4 }])).toEqual({ goals: 3, assists: 4 });
  });
  it('ignores junk and handles empty', () => {
    expect(m.aggregateStats([null, { key: 'goals', value: NaN }, { key: 'goals', value: '2' }, { value: 1 }])).toEqual({});
    expect(m.aggregateStats(undefined)).toEqual({});
  });
});
