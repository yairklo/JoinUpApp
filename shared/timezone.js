const TZ = 'Asia/Jerusalem';

function parseJerusalemTimeToUTC(dateStr, timeStr) {
  const utcDate = new Date(`${dateStr}T${timeStr}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // Deliberately no hour12 here: when both hour12 and hourCycle are set,
    // hour12 wins per spec, and some ICU builds default hour12:false to the
    // 1-24 cycle (midnight = "24") instead of 0-23. hourCycle alone is what
    // actually pins the cycle everywhere.
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(utcDate);
  const partVal = (type) => Number(parts.find((p) => p.type === type).value);
  // Date.UTC overflows out-of-range fields into the next unit, so an h24
  // "hour 24" (this ICU's midnight, whichever cycle it used) rolls into the
  // next day exactly like it should - no manual wraparound needed.
  const formattedJerusalem = new Date(Date.UTC(
    partVal('year'),
    partVal('month') - 1,
    partVal('day'),
    partVal('hour'),
    partVal('minute'),
    partVal('second')
  ));
  const offsetMs = formattedJerusalem.getTime() - utcDate.getTime();
  return new Date(utcDate.getTime() - offsetMs);
}

// Non-throwing variant of parseJerusalemTimeToUTC: Intl.formatToParts throws a RangeError on an
// Invalid Date (missing/blank/'HH:mm:ss' time), which would crash a render or list filter.
function tryParseJerusalemTimeToUTC(dateStr, timeStr) {
  try {
    const d = parseJerusalemTimeToUTC(dateStr, timeStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// Mobile date/time pickers only expose device-local getters. These two helpers translate between
// a real instant and a picker Date whose *local* fields read as Jerusalem wall-clock, so a device
// outside Israel shows and saves the same Jerusalem time (no shift per save).
function jerusalemInstantToPickerDate(instant) {
  const d = new Date(instant);
  const [y, m, day] = formatJerusalemDate(d).split('-').map(Number);
  const [h, min] = formatJerusalemTime(d).split(':').map(Number);
  return new Date(y, m - 1, day, h, min, 0, 0);
}

function pickerToJerusalemUTC(datePart, timePart = datePart) {
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${datePart.getFullYear()}-${pad(datePart.getMonth() + 1)}-${pad(datePart.getDate())}`;
  const timeStr = `${pad(timePart.getHours())}:${pad(timePart.getMinutes())}`;
  return parseJerusalemTimeToUTC(dateStr, timeStr);
}

function getJerusalemDayHour(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const partVal = (type) => parts.find((p) => p.type === type)?.value;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = dayNames.indexOf(partVal('weekday'));
  const hour = parseInt(partVal('hour'), 10) % 24;
  return { dayOfWeek, hour };
}

const ACTIVE_GAME_GRACE_MS = 30 * 60 * 1000;

function getActiveGameStartCutoff() {
  return new Date(Date.now() - ACTIVE_GAME_GRACE_MS);
}

function buildActiveGameStartFilter(dateInput) {
  const cutoff = getActiveGameStartCutoff();
  if (!dateInput) return { gte: cutoff };
  const d = new Date(String(dateInput));
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const isToday = startOfDay.getTime() === todayStart.getTime();
  return {
    gte: isToday ? cutoff : startOfDay,
    lte: endOfDay,
  };
}

function formatJerusalemDate(dateInput = new Date()) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

function formatJerusalemTime(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  // No day field here to overflow into, so normalize a "24" (this ICU's
  // midnight in whichever hour cycle it actually used) to "00" directly.
  const hour = (parts.find((p) => p.type === 'hour')?.value || '').replace(/^24$/, '00');
  const minute = parts.find((p) => p.type === 'minute')?.value || '';
  return `${hour}:${minute}`;
}

module.exports = {
  parseJerusalemTimeToUTC,
  tryParseJerusalemTimeToUTC,
  jerusalemInstantToPickerDate,
  pickerToJerusalemUTC,
  formatJerusalemDate,
  formatJerusalemTime,
  getJerusalemDayHour,
  getActiveGameStartCutoff,
  buildActiveGameStartFilter,
  ACTIVE_GAME_GRACE_MS,
};
