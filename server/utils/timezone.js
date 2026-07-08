/**
 * Timezone Utility for converting Israel/Jerusalem local time to UTC.
 */

function parseJerusalemTimeToUTC(dateStr, timeStr) {
  // Construct date assuming the local date and time is UTC
  const utcDate = new Date(`${dateStr}T${timeStr}:00Z`);
  
  // Format that date in the target timezone (Asia/Jerusalem)
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
  const partVal = (type) => parts.find(p => p.type === type).value;
  
  // Reconstruct the formatted date string back into a UTC Date object
  // to measure the timezone offset difference
  const formattedJerusalem = new Date(
    `${partVal('year')}-${partVal('month')}-${partVal('day')}T${partVal('hour')}:${partVal('minute')}:${partVal('second')}Z`
  );
  
  const offsetMs = formattedJerusalem.getTime() - utcDate.getTime();
  
  // Return the adjusted UTC timestamp
  return new Date(utcDate.getTime() - offsetMs);
}

/**
 * Returns { dayOfWeek, hour } for a given instant, expressed in Asia/Jerusalem
 * local time. dayOfWeek follows JS convention: 0 = Sunday ... 6 = Saturday.
 */
function getJerusalemDayHour(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const partVal = (type) => parts.find(p => p.type === type)?.value;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = dayNames.indexOf(partVal('weekday'));
  // Intl can emit "24" for midnight with hour12: false in some engines
  const hour = parseInt(partVal('hour'), 10) % 24;

  return { dayOfWeek, hour };
}

module.exports = {
  parseJerusalemTimeToUTC,
  getJerusalemDayHour
};
