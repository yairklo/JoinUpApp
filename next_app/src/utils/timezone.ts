import {
  formatJerusalemDate,
  formatJerusalemTime,
} from '@joinup/shared/timezone';

export { formatJerusalemDate, formatJerusalemTime };

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
