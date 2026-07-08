export function formatJerusalemDate(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value || "";
  const month = parts.find(p => p.type === 'month')?.value || "";
  const day = parts.find(p => p.type === 'day')?.value || "";
  return `${year}-${month}-${day}`;
}

export function formatJerusalemTime(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find(p => p.type === 'hour')?.value || "";
  const minute = parts.find(p => p.type === 'minute')?.value || "";
  return `${hour}:${minute}`;
}

// The server's mapGameForClient only ever returns the raw `start` ISO string on every game
// payload — the pre-formatted `date`/`time` strings most UI (GameHeaderCard, list sorting, etc.)
// render are computed once, server-side, by each page's own fetchGame(). Any game payload that
// arrives later over a socket (game:created, game:updated) or as a mutation's raw HTTP response
// (join/leave/approve/reject) is that same raw shape, so it must be normalized the exact same way
// before it touches component state — otherwise `date`/`time` end up missing and any code that
// assumes they're strings (e.g. `time.split(":")`) blows up.
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
