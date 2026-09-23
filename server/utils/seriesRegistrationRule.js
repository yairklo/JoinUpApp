const { parseJerusalemTimeToUTC, formatJerusalemDate } = require('./timezone');

// A group's (GameSeries) "registration opens every <weekday> at <HH:MM>" rule, in Asia/Jerusalem
// local time. Stored as a rule rather than a fixed hours-before offset so it stays at the same
// wall-clock time across DST changes and when the group's game time is edited.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isValidRegistrationOpenTime(value) {
  return typeof value === 'string' && TIME_RE.test(value);
}

function isValidRegistrationOpenDay(value) {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

// Shift a 'YYYY-MM-DD' calendar date by whole days (pure calendar math, no timezone involved).
function shiftDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

function weekdayOfDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The latest Jerusalem-local occurrence of (dayOfWeek, 'HH:MM') strictly before gameStart.
 * E.g. a Saturday 20:00 game with a Sunday 18:00 rule opens the preceding Sunday at 18:00.
 * Returns null for an invalid rule or start.
 */
function computeRegistrationOpensAt(gameStart, dayOfWeek, time) {
  const start = new Date(gameStart);
  if (Number.isNaN(start.getTime()) || !isValidRegistrationOpenDay(dayOfWeek) || !isValidRegistrationOpenTime(time)) {
    return null;
  }
  const gameDateStr = formatJerusalemDate(start);
  const daysBack = (weekdayOfDateStr(gameDateStr) - dayOfWeek + 7) % 7;
  let candidate = parseJerusalemTimeToUTC(shiftDateStr(gameDateStr, -daysBack), time);
  if (candidate.getTime() >= start.getTime()) {
    // Same weekday as the game but not earlier in the day -- use the week before.
    candidate = parseJerusalemTimeToUTC(shiftDateStr(gameDateStr, -daysBack - 7), time);
  }
  return candidate;
}

/**
 * registrationOpensAt for one of the series' games starting at `gameStart`: the weekday+time
 * rule when set, else the legacy relative autoOpenRegistrationHours offset, else null.
 */
function resolveSeriesRegistrationOpensAt(series, gameStart) {
  if (!series) return null;
  if (series.registrationOpenDayOfWeek !== null && series.registrationOpenDayOfWeek !== undefined && series.registrationOpenTime) {
    return computeRegistrationOpensAt(gameStart, series.registrationOpenDayOfWeek, series.registrationOpenTime);
  }
  if (typeof series.autoOpenRegistrationHours === 'number') {
    return new Date(new Date(gameStart).getTime() - series.autoOpenRegistrationHours * 3600000);
  }
  return null;
}

function seriesHasRegistrationRule(series) {
  return !!series && (
    (series.registrationOpenDayOfWeek !== null && series.registrationOpenDayOfWeek !== undefined && !!series.registrationOpenTime)
    || typeof series.autoOpenRegistrationHours === 'number'
  );
}

module.exports = {
  computeRegistrationOpensAt,
  resolveSeriesRegistrationOpensAt,
  seriesHasRegistrationRule,
  isValidRegistrationOpenDay,
  isValidRegistrationOpenTime,
};
