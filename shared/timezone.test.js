const {
  formatJerusalemDate,
  formatJerusalemTime,
  getJerusalemDayHour,
  buildActiveGameStartFilter,
  getActiveGameStartCutoff,
  ACTIVE_GAME_GRACE_MS,
} = require('./timezone');

describe('formatJerusalemDate', () => {
  test('formats a UTC instant as YYYY-MM-DD in Asia/Jerusalem', () => {
    // 2026-08-31T21:30:00Z is 2026-09-01 00:30 in Jerusalem (UTC+3, summer time)
    expect(formatJerusalemDate('2026-08-31T21:30:00Z')).toEqual('2026-09-01');
  });

  test('returns empty string for an invalid date', () => {
    expect(formatJerusalemDate('not-a-date')).toEqual('');
  });
});

describe('formatJerusalemTime', () => {
  test('formats a UTC instant as HH:MM in Asia/Jerusalem', () => {
    expect(formatJerusalemTime('2026-08-31T21:30:00Z')).toEqual('00:30');
  });

  test('returns empty string for an invalid date', () => {
    expect(formatJerusalemTime('not-a-date')).toEqual('');
  });
});

describe('getJerusalemDayHour', () => {
  test('returns the day-of-week and hour in Jerusalem time', () => {
    // 2026-08-31T21:30:00Z -> Tuesday 2026-09-01 00:30 in Jerusalem
    const { dayOfWeek, hour } = getJerusalemDayHour(new Date('2026-08-31T21:30:00Z'));
    expect(dayOfWeek).toEqual(2); // Tue
    expect(hour).toEqual(0);
  });
});

describe('buildActiveGameStartFilter', () => {
  test('without a date, filters from the active-game cutoff onward', () => {
    const before = getActiveGameStartCutoff().getTime();
    const { gte, lte } = buildActiveGameStartFilter();
    expect(lte).toBeUndefined();
    expect(gte.getTime()).toBeGreaterThanOrEqual(before);
    expect(Date.now() - gte.getTime()).toBeLessThanOrEqual(ACTIVE_GAME_GRACE_MS + 1000);
  });

  test('for a future date, filters the whole day (no grace cutoff)', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const { gte, lte } = buildActiveGameStartFilter(future);
    expect(gte.getHours()).toEqual(0);
    expect(lte.getHours()).toEqual(23);
    expect(gte.getDate()).toEqual(future.getDate());
  });

  test('for today, still applies the active-game grace cutoff', () => {
    const { gte } = buildActiveGameStartFilter(new Date());
    const cutoff = getActiveGameStartCutoff();
    expect(Math.abs(gte.getTime() - cutoff.getTime())).toBeLessThan(2000);
  });
});
