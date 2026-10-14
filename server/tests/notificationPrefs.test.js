const {
  CATEGORY_BY_TYPE,
  CHANNEL_FIELDS,
  DEFAULT_SETTINGS,
  withDefaults,
  sanitizeSettingsUpdate,
  sanitizeMuteInput,
  isInQuietHours,
  decideDelivery,
  toClientSettings,
} = require('../utils/notificationPrefs');

// 2026-10-14T12:00:00Z = 15:00 in Asia/Jerusalem (IDT, UTC+3)
const NOON_UTC = new Date('2026-10-14T12:00:00Z');

describe('notificationPrefs', () => {
  test('every NotificationType in the schema has a category with channel fields', () => {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    const block = schema.match(/enum NotificationType \{([^}]*)\}/)[1];
    const types = block.split(/\s+/).filter(Boolean);
    for (const t of types) {
      expect(CATEGORY_BY_TYPE[t]).toBeDefined();
      expect(CHANNEL_FIELDS[CATEGORY_BY_TYPE[t]]).toBeDefined();
    }
  });

  test('defaults: city push off, city in-app on, friend joins opt-in', () => {
    const s = withDefaults(null);
    expect(s.cityGamesPush).toBe(false);
    expect(s.cityGamesInApp).toBe(true);
    expect(s.friendJoinsPush).toBe(false);
    expect(decideDelivery({ settings: null, type: 'NEW_GAME_IN_CITY', now: NOON_UTC })).toMatchObject({ inApp: true, push: false });
    expect(decideDelivery({ settings: null, type: 'FRIEND_NEW_GAME', now: NOON_UTC })).toMatchObject({ inApp: true, push: true });
    expect(decideDelivery({ settings: null, type: 'FRIEND_JOINED_GAME', now: NOON_UTC })).toMatchObject({ inApp: false, push: false });
  });

  test('legacy push columns are honored', () => {
    const settings = { ...DEFAULT_SETTINGS, friendRequestsEnabled: false, messagesEnabled: false, gameRemindersEnabled: false };
    expect(decideDelivery({ settings, type: 'FRIEND_REQUEST', now: NOON_UTC })).toMatchObject({ inApp: true, push: false });
    expect(decideDelivery({ settings, type: 'NEW_MESSAGE', now: NOON_UTC })).toMatchObject({ inApp: false, push: false });
    expect(decideDelivery({ settings, type: 'GAME_REMINDER', now: NOON_UTC })).toMatchObject({ inApp: true, push: false });
  });

  test('master push off keeps in-app', () => {
    const settings = { ...DEFAULT_SETTINGS, pushEnabled: false };
    expect(decideDelivery({ settings, type: 'GAME_INVITATION', now: NOON_UTC })).toMatchObject({ inApp: true, push: false });
  });

  test('in-app switch off drops the feed entry', () => {
    const settings = { ...DEFAULT_SETTINGS, cityGamesInApp: false, cityGamesPush: true };
    expect(decideDelivery({ settings, type: 'NEW_GAME_IN_CITY', now: NOON_UTC })).toMatchObject({ inApp: false, push: true });
  });

  test('urgent types push through quiet hours and snooze, but not through master push off', () => {
    const quiet = { ...DEFAULT_SETTINGS, quietHoursEnabled: true, quietHoursStart: 14 * 60, quietHoursEnd: 16 * 60 };
    const snoozed = { ...DEFAULT_SETTINGS, snoozeUntil: new Date('2026-10-14T13:00:00Z') };
    for (const settings of [quiet, snoozed]) {
      expect(decideDelivery({ settings, type: 'GAME_WAITLIST_OFFER', now: NOON_UTC }).push).toBe(true);
      expect(decideDelivery({ settings, type: 'GAME_CANCELLED', now: NOON_UTC }).push).toBe(true);
      expect(decideDelivery({ settings, type: 'GAME_UPDATED', now: NOON_UTC }).push).toBe(false);
    }
    expect(decideDelivery({ settings: { ...DEFAULT_SETTINGS, pushEnabled: false }, type: 'GAME_WAITLIST_OFFER', now: NOON_UTC }).push).toBe(false);
  });

  describe('quiet hours', () => {
    const base = { ...DEFAULT_SETTINGS, quietHoursEnabled: true };
    test('wrap-around window 23:00-07:00', () => {
      expect(isInQuietHours(base, new Date('2026-10-14T21:30:00Z'))).toBe(true); // 00:30 local
      expect(isInQuietHours(base, new Date('2026-10-14T20:00:00Z'))).toBe(true); // 23:00 local
      expect(isInQuietHours(base, new Date('2026-10-14T04:00:00Z'))).toBe(false); // 07:00 local
      expect(isInQuietHours(base, NOON_UTC)).toBe(false);
    });
    test('same-day window', () => {
      const s = { ...base, quietHoursStart: 14 * 60, quietHoursEnd: 16 * 60 };
      expect(isInQuietHours(s, NOON_UTC)).toBe(true);
    });
    test('start === end means disabled', () => {
      expect(isInQuietHours({ ...base, quietHoursStart: 600, quietHoursEnd: 600 }, NOON_UTC)).toBe(false);
    });
    test('follows DST: 22:30Z is 00:30 in summer but 00:30 in winter only at 22:30Z', () => {
      // Winter (IST, UTC+2): 2026-12-01T22:30Z = 00:30 local -> quiet
      expect(isInQuietHours(base, new Date('2026-12-01T22:30:00Z'))).toBe(true);
      // Winter: 05:30Z = 07:30 local -> not quiet
      expect(isInQuietHours(base, new Date('2026-12-01T05:30:00Z'))).toBe(false);
    });
    test('quiet hours block push only', () => {
      const s = { ...base, quietHoursStart: 14 * 60, quietHoursEnd: 16 * 60 };
      expect(decideDelivery({ settings: s, type: 'GAME_REMINDER', now: NOON_UTC })).toMatchObject({ inApp: true, push: false });
    });
  });

  test('snooze blocks push until it expires', () => {
    const s = { ...DEFAULT_SETTINGS, snoozeUntil: new Date('2026-10-14T13:00:00Z') };
    expect(decideDelivery({ settings: s, type: 'FRIEND_REQUEST', now: NOON_UTC }).push).toBe(false);
    expect(decideDelivery({ settings: s, type: 'FRIEND_REQUEST', now: new Date('2026-10-14T13:00:01Z') }).push).toBe(true);
  });

  describe('mutes', () => {
    const mutes = [
      { targetType: 'USER', targetId: 'u_muted', until: null },
      { targetType: 'SERIES', targetId: 's_1', until: new Date('2026-10-14T11:00:00Z') }, // expired
      { targetType: 'GAME', targetId: 'g_1', until: new Date('2026-10-15T00:00:00Z') },
    ];
    test('muted actor silences both channels', () => {
      expect(decideDelivery({ settings: null, mutes, type: 'FRIEND_NEW_GAME', ctx: { actorId: 'u_muted' }, now: NOON_UTC }))
        .toMatchObject({ inApp: false, push: false, reason: 'muted' });
    });
    test('expired mute is ignored', () => {
      expect(decideDelivery({ settings: null, mutes, type: 'NEW_SERIES_GAME', ctx: { seriesId: 's_1' }, now: NOON_UTC }).inApp).toBe(true);
    });
    test('game mute applies to updates', () => {
      expect(decideDelivery({ settings: null, mutes, type: 'GAME_UPDATED', ctx: { gameId: 'g_1' }, now: NOON_UTC }).inApp).toBe(false);
    });
    test('safety-critical types bypass mutes and in-app switch', () => {
      const s = { ...DEFAULT_SETTINGS, myGamesInApp: false };
      expect(decideDelivery({ settings: s, mutes, type: 'GAME_CANCELLED', ctx: { actorId: 'u_muted', gameId: 'g_1' }, now: NOON_UTC }))
        .toMatchObject({ inApp: true, push: true });
    });
  });

  test('unknown type fails open', () => {
    expect(decideDelivery({ settings: null, type: 'SOMETHING_NEW', now: NOON_UTC })).toMatchObject({ inApp: true, push: true });
  });

  describe('sanitizeSettingsUpdate', () => {
    test('accepts valid partial updates and ignores unknown keys', () => {
      const { data, errors } = sanitizeSettingsUpdate({ cityGamesPush: true, foo: 1, quietHoursStart: 60, timezone: 'Europe/London' });
      expect(errors).toEqual([]);
      expect(data).toEqual({ cityGamesPush: true, quietHoursStart: 60, timezone: 'Europe/London' });
    });
    test('rejects bad values', () => {
      const { errors } = sanitizeSettingsUpdate({
        pushEnabled: 'yes', quietHoursEnd: 2000, timezone: 'Mars/Base', cityGamesSports: ['CHESS'],
      });
      expect(errors).toHaveLength(4);
    });
    test('normalizes and de-dupes cities, caps the count', () => {
      expect(sanitizeSettingsUpdate({ cityGamesCities: [' חיפה ', 'חיפה', ''] }).data.cityGamesCities).toEqual(['חיפה']);
      // Cities outside the alias map are stored lower-cased so matching ignores case
      expect(sanitizeSettingsUpdate({ cityGamesCities: ['Kfar Saba', 'kfar saba'] }).data.cityGamesCities).toEqual(['kfar saba']);
      expect(sanitizeSettingsUpdate({ cityGamesCities: Array.from({ length: 11 }, (_, i) => `c${i}`) }).errors).toHaveLength(1);
    });
    test('snooze limited to 30 days, null clears', () => {
      expect(sanitizeSettingsUpdate({ snoozeUntil: '2026-12-31T00:00:00Z' }, NOON_UTC).errors).toHaveLength(1);
      expect(sanitizeSettingsUpdate({ snoozeUntil: null }).data).toEqual({ snoozeUntil: null });
    });
  });

  describe('sanitizeMuteInput', () => {
    test('duration converts to until', () => {
      const { data, errors } = sanitizeMuteInput({ targetType: 'USER', targetId: 'u1', durationHours: 8 }, NOON_UTC);
      expect(errors).toEqual([]);
      expect(data.until.toISOString()).toBe('2026-10-14T20:00:00.000Z');
    });
    test('forever when neither given', () => {
      expect(sanitizeMuteInput({ targetType: 'SERIES', targetId: 's1' }).data.until).toBeNull();
    });
    test('rejects bad target type / past until', () => {
      expect(sanitizeMuteInput({ targetType: 'CITY', targetId: 'x' }).errors).toHaveLength(1);
      expect(sanitizeMuteInput({ targetType: 'USER', targetId: 'x', until: '2020-01-01' }, NOON_UTC).errors).toHaveLength(1);
    });
  });

  test('cityMatchKeys covers the stored form of a field city in any case', () => {
    const { cityMatchKeys, canonicalCityKey } = require('../utils/notificationPrefs');
    expect(cityMatchKeys('Kfar Saba')).toContain(canonicalCityKey('KFAR SABA'));
    expect(cityMatchKeys('חיפה')).toContain('חיפה');
  });

  test('toClientSettings hides expired snooze and mutes', () => {
    const dto = toClientSettings(
      { pushEnabled: false, snoozeUntil: new Date('2026-10-14T11:00:00Z') },
      [{ targetType: 'USER', targetId: 'a', until: new Date('2026-10-14T11:00:00Z') }, { targetType: 'USER', targetId: 'b', until: null }],
      NOON_UTC
    );
    expect(dto.pushEnabled).toBe(false);
    expect(dto.snoozeUntil).toBeNull();
    expect(dto.mutes.map(m => m.targetId)).toEqual(['b']);
    expect(dto.cityGamesInApp).toBe(true);
  });
});
