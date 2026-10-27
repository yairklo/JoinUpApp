const {
  getFieldSportTags,
  fieldMatchesSportFilter,
  getFieldMarkerVisual,
  getSportColorHex,
  NEUTRAL_MARKER_VISUAL,
} = require('./mapSport');
const { SPORT_THEME } = require('./sports');

describe('getFieldSportTags', () => {
  test('normalizes enum and Hebrew labels, dedupes, drops unknowns', () => {
    expect(getFieldSportTags({ supportedSports: ['SOCCER', 'כדורגל', 'כדורסל', 'curling'] })).toEqual([
      'SOCCER',
      'BASKETBALL',
    ]);
  });
  test('empty for missing sports', () => {
    expect(getFieldSportTags({})).toEqual([]);
    expect(getFieldSportTags({ supportedSports: [] })).toEqual([]);
  });
});

describe('fieldMatchesSportFilter', () => {
  test('no filter matches everything, including fields with no sports', () => {
    expect(fieldMatchesSportFilter({ supportedSports: [] }, null)).toBe(true);
    expect(fieldMatchesSportFilter({ supportedSports: ['TENNIS'] }, undefined)).toBe(true);
  });
  test('single sport', () => {
    expect(fieldMatchesSportFilter({ supportedSports: ['TENNIS'] }, 'TENNIS')).toBe(true);
    expect(fieldMatchesSportFilter({ supportedSports: ['TENNIS'] }, 'SOCCER')).toBe(false);
  });
  test('multi-sport matches if any sport equals the filter', () => {
    const f = { supportedSports: ['SOCCER', 'BASKETBALL'] };
    expect(fieldMatchesSportFilter(f, 'BASKETBALL')).toBe(true);
    expect(fieldMatchesSportFilter(f, 'TENNIS')).toBe(false);
  });
  test('field with no sports does not match an active filter', () => {
    expect(fieldMatchesSportFilter({}, 'SOCCER')).toBe(false);
  });
});

describe('getFieldMarkerVisual', () => {
  test('single sport uses the sport colour from the shared theme', () => {
    const v = getFieldMarkerVisual({ supportedSports: ['BASKETBALL'] });
    expect(v).toEqual({ iconName: 'basketball', colorHex: SPORT_THEME.BASKETBALL.base, variant: 'sport' });
  });
  test('multi-sport is neutral', () => {
    expect(getFieldMarkerVisual({ supportedSports: ['SOCCER', 'TENNIS'] })).toBe(NEUTRAL_MARKER_VISUAL);
  });
  test('no sport is neutral', () => {
    expect(getFieldMarkerVisual({})).toBe(NEUTRAL_MARKER_VISUAL);
  });
  test('mobile-only sports keep their colours', () => {
    expect(getSportColorHex('PADEL')).toBe('#a855f7');
    expect(getSportColorHex('VOLLEYBALL')).toBe('#06b6d4');
  });
});
