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

export function parseJerusalemTimeToUTC(dateStr: string, timeStr: string): Date {
  const utcDate = new Date(`${dateStr}T${timeStr}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(utcDate);
  const partVal = (type: string) => parts.find(p => p.type === type)?.value || "";
  const formattedJerusalem = new Date(
    `${partVal('year')}-${partVal('month')}-${partVal('day')}T${partVal('hour')}:${partVal('minute')}:${partVal('second')}Z`
  );
  const offsetMs = formattedJerusalem.getTime() - utcDate.getTime();
  return new Date(utcDate.getTime() - offsetMs);
}

export function getJerusalemDayRangeUTC(dateStr: string) {
  const start = parseJerusalemTimeToUTC(dateStr, "00:00");
  const end = new Date(parseJerusalemTimeToUTC(dateStr, "23:59").getTime() + 59999);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
}
