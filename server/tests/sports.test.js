const { resolveSportFilters, SPORT_KEYS } = require('../utils/sports');

describe('sport catalog', () => {
  test('maps Hebrew queries to Prisma enums', () => {
    expect(resolveSportFilters('כדורגל')).toEqual(['SOCCER']);
    expect(resolveSportFilters('טניס')).toEqual(['TENNIS']);
    expect(resolveSportFilters('soccer')).toEqual(['SOCCER']);
  });

  test('returns no filter for unrelated text', () => {
    expect(resolveSportFilters('רמת גן')).toEqual([]);
  });

  test('SPORT_KEYS matches the Game.sport enum', () => {
    expect(SPORT_KEYS).toEqual(['SOCCER', 'BASKETBALL', 'TENNIS']);
  });
});
