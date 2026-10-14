// Pure notification-preference engine: category mapping, defaults, input validation and the
// per-recipient delivery decision. No Prisma access here — NotificationService loads the rows
// and calls decideDelivery(), so every notification goes through one choke point.
const { normalizeCity, CITY_ALIASES } = require('./cityAliases');
// Type -> category and the always-delivered / urgent lists are shared with both clients
// (server/shared is the vendored copy of shared/, see scripts/sync-shared.js).
const {
  CATEGORY_BY_NOTIFICATION_TYPE,
  ALWAYS_DELIVERED_TYPES,
  URGENT_PUSH_TYPES,
} = require('../shared/notificationPrefs');

const SPORTS = ['SOCCER', 'BASKETBALL', 'TENNIS'];
const MUTE_TARGETS = ['USER', 'SERIES', 'GAME'];
const MAX_CITIES = 10;
const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MUTE_MS = 365 * 24 * 60 * 60 * 1000;

const CATEGORY_BY_TYPE = CATEGORY_BY_NOTIFICATION_TYPE;

// The first three push columns predate this module and keep their names for old clients.
// inApp: null = the category has no in-app feed entry (chat uses chat:sync + counters).
const CHANNEL_FIELDS = {
  friendRequests: { push: 'friendRequestsEnabled', inApp: 'friendRequestsInApp' },
  messages: { push: 'messagesEnabled', inApp: null },
  gameReminders: { push: 'gameRemindersEnabled', inApp: 'gameRemindersInApp' },
  myGames: { push: 'myGamesPush', inApp: 'myGamesInApp' },
  invitations: { push: 'invitationsPush', inApp: 'invitationsInApp' },
  organizer: { push: 'organizerPush', inApp: 'organizerInApp' },
  groupGames: { push: 'groupGamesPush', inApp: 'groupGamesInApp' },
  friendGames: { push: 'friendGamesPush', inApp: 'friendGamesInApp' },
  friendJoins: { push: 'friendJoinsPush', inApp: 'friendJoinsInApp' },
  cityGames: { push: 'cityGamesPush', inApp: 'cityGamesInApp' },
};

// Things a user must learn about even from someone they muted (their own game changed under them).
const NEVER_MUTED_TYPES = new Set(ALWAYS_DELIVERED_TYPES);
// Push for these also ignores quiet hours and snooze — waiting until morning defeats them.
const URGENT_TYPES = new Set(URGENT_PUSH_TYPES);

// Mirrors the schema defaults (schema.prisma UserNotificationSettings).
const DEFAULT_SETTINGS = Object.freeze({
  pushEnabled: true,
  friendRequestsEnabled: true,
  messagesEnabled: true,
  gameRemindersEnabled: true,
  friendRequestsInApp: true,
  gameRemindersInApp: true,
  myGamesPush: true,
  myGamesInApp: true,
  invitationsPush: true,
  invitationsInApp: true,
  organizerPush: true,
  organizerInApp: true,
  groupGamesPush: true,
  groupGamesInApp: true,
  friendGamesPush: true,
  friendGamesInApp: true,
  friendJoinsPush: false,
  friendJoinsInApp: false,
  cityGamesPush: false,
  cityGamesInApp: true,
  cityGamesSports: [],
  cityGamesCities: [],
  quietHoursEnabled: false,
  quietHoursStart: 23 * 60,
  quietHoursEnd: 7 * 60,
  timezone: 'Asia/Jerusalem',
  snoozeUntil: null,
  cityPromptDismissedAt: null,
});

const BOOLEAN_KEYS = Object.keys(DEFAULT_SETTINGS).filter(k => typeof DEFAULT_SETTINGS[k] === 'boolean');

function withDefaults(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (row[key] !== undefined && row[key] !== null) out[key] = row[key];
  }
  return out;
}

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isMinuteOfDay(v) {
  return Number.isInteger(v) && v >= 0 && v < 24 * 60;
}

/**
 * Whitelists and validates a settings update. Unknown keys are ignored (old/new client skew);
 * invalid values for known keys are reported so the route can 400.
 */
function sanitizeSettingsUpdate(body, now = new Date()) {
  const data = {};
  const errors = [];
  if (!body || typeof body !== 'object') return { data, errors: ['body must be an object'] };

  for (const key of BOOLEAN_KEYS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') errors.push(`${key} must be a boolean`);
    else data[key] = body[key];
  }

  for (const key of ['quietHoursStart', 'quietHoursEnd']) {
    if (body[key] === undefined) continue;
    if (!isMinuteOfDay(body[key])) errors.push(`${key} must be an integer 0-1439`);
    else data[key] = body[key];
  }

  if (body.timezone !== undefined) {
    if (!isValidTimezone(body.timezone)) errors.push('timezone must be a valid IANA time zone');
    else data.timezone = body.timezone;
  }

  if (body.cityGamesSports !== undefined) {
    if (!Array.isArray(body.cityGamesSports) || body.cityGamesSports.some(s => !SPORTS.includes(s))) {
      errors.push(`cityGamesSports must be an array of ${SPORTS.join('/')}`);
    } else data.cityGamesSports = Array.from(new Set(body.cityGamesSports));
  }

  if (body.cityGamesCities !== undefined) {
    if (!Array.isArray(body.cityGamesCities) || body.cityGamesCities.some(c => typeof c !== 'string')) {
      errors.push('cityGamesCities must be an array of strings');
    } else {
      const cities = Array.from(new Set(
        body.cityGamesCities.map(c => canonicalCityKey(c.slice(0, 80))).filter(Boolean)
      ));
      if (cities.length > MAX_CITIES) errors.push(`cityGamesCities allows at most ${MAX_CITIES} cities`);
      else data.cityGamesCities = cities;
    }
  }

  for (const key of ['snoozeUntil', 'cityPromptDismissedAt']) {
    if (body[key] === undefined) continue;
    if (body[key] === null) { data[key] = null; continue; }
    const d = new Date(body[key]);
    if (Number.isNaN(d.getTime())) { errors.push(`${key} must be an ISO date or null`); continue; }
    if (key === 'snoozeUntil' && d.getTime() - now.getTime() > MAX_SNOOZE_MS) {
      errors.push('snoozeUntil can be at most 30 days ahead');
      continue;
    }
    data[key] = d;
  }

  return { data, errors };
}

const KNOWN_CANONICAL_CITIES = new Set(Object.values(CITY_ALIASES));

/**
 * The form a city is stored in cityGamesCities: the alias-map canonical name when known,
 * otherwise trimmed + lower-cased (Postgres array `has` is case-sensitive).
 */
function canonicalCityKey(city) {
  const canonical = normalizeCity(String(city || '').trim());
  if (!canonical) return '';
  return KNOWN_CANONICAL_CITIES.has(canonical) ? canonical : canonical.toLowerCase();
}

/** Every stored form a field's city could match in cityGamesCities. */
function cityMatchKeys(city) {
  const canonical = normalizeCity(String(city || '').trim());
  if (!canonical) return [];
  return Array.from(new Set([canonical, canonical.toLowerCase(), canonicalCityKey(city)]));
}

/** Minutes since local midnight in `timezone`. */
function localMinutes(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: isValidTimezone(timezone) ? timezone : DEFAULT_SETTINGS.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value);
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

function isInQuietHours(settings, now = new Date()) {
  if (!settings.quietHoursEnabled) return false;
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;
  if (start === end) return false;
  const t = localMinutes(now, settings.timezone);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

function isSnoozed(settings, now = new Date()) {
  return !!settings.snoozeUntil && new Date(settings.snoozeUntil).getTime() > now.getTime();
}

function isMuteActive(mute, now = new Date()) {
  return !mute.until || new Date(mute.until).getTime() > now.getTime();
}

function isMuted(mutes, ctx = {}, now = new Date()) {
  if (!mutes || mutes.length === 0) return false;
  return mutes.some(m => isMuteActive(m, now) && (
    (m.targetType === 'USER' && ctx.actorId && m.targetId === ctx.actorId) ||
    (m.targetType === 'SERIES' && ctx.seriesId && m.targetId === ctx.seriesId) ||
    (m.targetType === 'GAME' && ctx.gameId && m.targetId === ctx.gameId)
  ));
}

/**
 * @returns {{ inApp: boolean, push: boolean, reason: string }}
 */
function decideDelivery({ settings, mutes = [], type, ctx = {}, now = new Date() }) {
  const s = withDefaults(settings);
  const category = CATEGORY_BY_TYPE[type];
  if (!category) {
    // Unknown type: fail open so a new type is never silently dropped.
    return { inApp: true, push: passesPushGates(s, now), reason: 'unknown_type' };
  }
  const fields = CHANNEL_FIELDS[category];

  if (!NEVER_MUTED_TYPES.has(type) && isMuted(mutes, ctx, now)) {
    return { inApp: false, push: false, reason: 'muted' };
  }

  // The in-app copy of a safety-critical notification is always kept.
  const inApp = fields.inApp === null ? false : (NEVER_MUTED_TYPES.has(type) || s[fields.inApp] !== false);
  let push = s[fields.push] !== false && passesPushGates(s, now, URGENT_TYPES.has(type));

  return { inApp, push, reason: push || inApp ? 'ok' : 'disabled' };
}

function passesPushGates(s, now, urgent = false) {
  if (s.pushEnabled === false) return false;
  return urgent || (!isSnoozed(s, now) && !isInQuietHours(s, now));
}

/** Validates a mute request body; returns { data, errors }. */
function sanitizeMuteInput(body, now = new Date()) {
  const errors = [];
  const targetType = body?.targetType;
  const targetId = body?.targetId;
  if (!MUTE_TARGETS.includes(targetType)) errors.push(`targetType must be one of ${MUTE_TARGETS.join('/')}`);
  if (typeof targetId !== 'string' || !targetId.trim()) errors.push('targetId is required');

  let until = null;
  if (body?.durationHours !== undefined && body.durationHours !== null) {
    const h = Number(body.durationHours);
    if (!Number.isFinite(h) || h <= 0 || h * 3600000 > MAX_MUTE_MS) errors.push('durationHours must be between 0 and 8760');
    else until = new Date(now.getTime() + h * 3600000);
  } else if (body?.until !== undefined && body.until !== null) {
    const d = new Date(body.until);
    if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) errors.push('until must be a future ISO date');
    else until = d;
  }
  return { data: { targetType, targetId: typeof targetId === 'string' ? targetId.trim() : targetId, until }, errors };
}

/** Client DTO: every setting (defaults filled in) + active mutes. Legacy fields keep their names. */
function toClientSettings(row, mutes = [], now = new Date()) {
  const s = withDefaults(row);
  return {
    ...s,
    snoozeUntil: isSnoozed(s, now) ? new Date(s.snoozeUntil).toISOString() : null,
    cityPromptDismissedAt: s.cityPromptDismissedAt ? new Date(s.cityPromptDismissedAt).toISOString() : null,
    mutes: mutes.filter(m => isMuteActive(m, now)),
  };
}

module.exports = {
  SPORTS,
  MUTE_TARGETS,
  CATEGORY_BY_TYPE,
  CHANNEL_FIELDS,
  NEVER_MUTED_TYPES,
  URGENT_TYPES,
  canonicalCityKey,
  cityMatchKeys,
  passesPushGates,
  DEFAULT_SETTINGS,
  withDefaults,
  sanitizeSettingsUpdate,
  sanitizeMuteInput,
  localMinutes,
  isInQuietHours,
  isSnoozed,
  isMuteActive,
  isMuted,
  decideDelivery,
  toClientSettings,
};
