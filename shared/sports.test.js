const { resolveSportFilters, SPORT_MAPPING, SPORT_EMOJI, POSITION_OPTIONS } = require('./sports');

describe('resolveSportFilters', () => {
  test('returns nothing for an empty query', () => {
    expect(resolveSportFilters('')).toEqual([]);
    expect(resolveSportFilters('   ')).toEqual([]);
    expect(resolveSportFilters(undefined)).toEqual([]);
  });

  test('matches the English enum key case-insensitively', () => {
    expect(resolveSportFilters('soc')).toEqual(['SOCCER']);
    expect(resolveSportFilters('BASKET')).toEqual(['BASKETBALL']);
  });

  test('matches Hebrew sport names, including short aliases', () => {
    expect(resolveSportFilters('כדורגל')).toEqual(['SOCCER']);
    expect(resolveSportFilters('סל')).toEqual(['BASKETBALL']);
    expect(resolveSportFilters('טניס')).toEqual(['TENNIS']);
  });

  test('deduplicates when both the key and a Hebrew alias match', () => {
    // "כדורגל" contains "רגל", both of which map to SOCCER
    expect(resolveSportFilters('כדורגל')).toEqual(['SOCCER']);
  });

  test('returns no matches for an unrelated query', () => {
    expect(resolveSportFilters('xyz')).toEqual([]);
  });
});

describe('sport lookup tables', () => {
  test('every sport has a Hebrew label, emoji, and position list', () => {
    for (const key of ['SOCCER', 'BASKETBALL', 'TENNIS']) {
      expect(SPORT_MAPPING[key]).toEqual(expect.any(String));
      expect(SPORT_EMOJI[key]).toEqual(expect.any(String));
      expect(Array.isArray(POSITION_OPTIONS[key])).toBe(true);
      expect(POSITION_OPTIONS[key].length).toBeGreaterThan(0);
    }
  });
});
