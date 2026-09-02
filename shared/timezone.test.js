const {
  formatJerusalemDate,
  formatJerusalemTime,
  getJerusalemDayHour,
  parseJerusalemTimeToUTC,
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

  test('normalizes a "24" hour to "00" (some ICU builds use a 1-24 cycle for midnight)', () => {
    const spy = jest.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
      .mockReturnValue([{ type: 'hour', value: '24' }, { type: 'minute', value: '30' }]);
    try {
      expect(formatJerusalemTime('2026-08-31T21:30:00Z')).toEqual('00:30');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('parseJerusalemTimeToUTC', () => {
  test('converts a Jerusalem local date+time to the equivalent UTC instant', () => {
    // 21:30 Jerusalem on 2026-08-31 (UTC+3 in summer) is 18:30 UTC the same day
    const result = parseJerusalemTimeToUTC('2026-08-31', '21:30');
    expect(result.toISOString()).toEqual('2026-08-31T18:30:00.000Z');
  });

  test('rolls over to the next day when ICU reports hour "24" for midnight', () => {
    // Simulate an ICU build that uses the 1-24 hour cycle: for the instant
    // 2026-09-01T00:30 Jerusalem, it reports day=31 (Aug), hour=24 instead
    // of day=01 (Sep), hour=00. Date.UTC must still resolve this correctly.
    const spy = jest.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'year', value: '2026' },
      { type: 'month', value: '08' },
      { type: 'day', value: '31' },
      { type: 'hour', value: '24' },
      { type: 'minute', value: '30' },
      { type: 'second', value: '00' },
    ]);
    try {
      const result = parseJerusalemTimeToUTC('2026-08-31', '21:30');
      expect(result.toISOString()).toEqual('2026-08-31T18:30:00.000Z');
    } finally {
      spy.mockRestore();
    }
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
