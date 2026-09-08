const {
  DEFAULT_CITY,
  normalizeCity,
  expandCityAliases,
  prismaFieldCityFilter,
  sqlCanonicalCityExpr,
} = require('./cityAliases');

describe('city aliases', () => {
  test('normalizeCity maps Tel Aviv spellings to the canonical Hebrew name', () => {
    expect(normalizeCity('תל אביב')).toBe(DEFAULT_CITY);
    expect(normalizeCity('Tel Aviv')).toBe(DEFAULT_CITY);
    expect(normalizeCity('Tel Aviv-Yafo')).toBe(DEFAULT_CITY);
    expect(normalizeCity(DEFAULT_CITY)).toBe(DEFAULT_CITY);
  });

  test('normalizeCity leaves unrelated cities unchanged', () => {
    expect(normalizeCity('ירושלים')).toBe('ירושלים');
    expect(normalizeCity('  חיפה  ')).toBe('חיפה');
    expect(normalizeCity('')).toBe('');
    expect(normalizeCity(null)).toBe('');
  });

  test('normalizeCity matches English aliases case-insensitively, like the DB-side comparison', () => {
    expect(normalizeCity('tel aviv')).toBe(DEFAULT_CITY);
    expect(normalizeCity('TEL AVIV')).toBe(DEFAULT_CITY);
    expect(normalizeCity('tel aviv-yafo')).toBe(DEFAULT_CITY);
  });

  test('expandCityAliases includes every spelling in the group', () => {
    const expanded = expandCityAliases('תל אביב');
    expect(expanded).toEqual(expect.arrayContaining([DEFAULT_CITY, 'תל אביב', 'Tel Aviv', 'Tel Aviv-Yafo']));
    expect(expandCityAliases('ירושלים')).toEqual(['ירושלים']);
  });

  test('prismaFieldCityFilter ORs aliases so a canonical query still matches short spellings', () => {
    const filter = prismaFieldCityFilter('תל אביב-יפו');
    expect(filter.OR).toEqual(
      expect.arrayContaining([
        { city: { equals: DEFAULT_CITY, mode: 'insensitive' } },
        { city: { equals: 'תל אביב', mode: 'insensitive' } },
      ])
    );
  });

  test('sqlCanonicalCityExpr coalesces aliases and does not interpolate untrusted SQL', () => {
    const expr = sqlCanonicalCityExpr('f.city');
    expect(expr).toContain("WHEN f.city IN");
    expect(expr).toContain(DEFAULT_CITY);
    expect(expr).toContain('תל אביב');
    expect(expr.startsWith('CASE ')).toBe(true);
  });
});
