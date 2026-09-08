import {
  formatJerusalemDate,
  formatJerusalemTime,
} from '@joinup/shared/timezone';

export { formatJerusalemDate, formatJerusalemTime };

const JERUSALEM_TZ = 'Asia/Jerusalem';

/**
 * Hebrew long display format used for rail headers / section titles, e.g.
 * "יום ד׳, 9 בספטמבר". Always pass an explicit `timeZone` (never a bare
 * `toLocaleDateString`) so this renders identically on the server (Node,
 * usually UTC) and the client (the visitor's real zone) -- see
 * frontend_rules.md §2.1.
 */
export function formatJerusalemDateLong(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: JERUSALEM_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Compact "weekday + day" label for date-nav pills, e.g. "יום ד׳ 9".
 * Same explicit-timeZone rule as formatJerusalemDateLong.
 */
export function formatJerusalemWeekdayShort(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: JERUSALEM_TZ,
    weekday: 'short',
    day: 'numeric',
  }).format(date);
}

export function normalizeIncomingGame<T extends { start?: string }>(payload: T): T {
  if (!payload || !payload.start) return payload;
  try {
    return {
      ...payload,
      date: formatJerusalemDate(payload.start),
      time: formatJerusalemTime(payload.start),
    };
  } catch (e) {
    console.error("[normalizeIncomingGame] Failed to format incoming game date/time", e);
    return payload;
  }
}
