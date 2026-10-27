const { NOTIFICATION_CATEGORIES, CATEGORY_BY_NOTIFICATION_TYPE, minutesToHHMM, HHMMToMinutes } = require('./notificationPrefs');

test('time helpers round-trip', () => {
  expect(minutesToHHMM(0)).toBe('00:00');
  expect(minutesToHHMM(1380)).toBe('23:00');
  expect(minutesToHHMM(1440 + 65)).toBe('01:05');
  expect(HHMMToMinutes('07:30')).toBe(450);
  expect(HHMMToMinutes('7:30')).toBe(450);
  expect(HHMMToMinutes('24:00')).toBeNull();
  expect(HHMMToMinutes('abc')).toBeNull();
});

test('every mapped type points at a listed category', () => {
  const keys = new Set(NOTIFICATION_CATEGORIES.map(c => c.key));
  for (const cat of Object.values(CATEGORY_BY_NOTIFICATION_TYPE)) expect(keys.has(cat)).toBe(true);
});

const { GAME_REMINDER_LEAD_PRESETS, isValidGameReminderLead, describeLeadMinutes } = require('./notificationPrefs');

test('game reminder lead: presets valid, range and step enforced', () => {
  expect(GAME_REMINDER_LEAD_PRESETS).toEqual([15, 30, 60, 120, 1440]);
  GAME_REMINDER_LEAD_PRESETS.forEach(p => expect(isValidGameReminderLead(p)).toBe(true));
  [5, 45, 135, 2880].forEach(v => expect(isValidGameReminderLead(v)).toBe(true));
  [0, 3, 7, 2885, '60', null, 1.5].forEach(v => expect(isValidGameReminderLead(v)).toBe(false));
});

test('describeLeadMinutes words', () => {
  expect(describeLeadMinutes(45, 'he')).toBe('45 דקות');
  expect(describeLeadMinutes(60, 'he')).toBe('שעה');
  expect(describeLeadMinutes(120, 'he')).toBe('שעתיים');
  expect(describeLeadMinutes(135, 'he')).toBe('שעתיים ו-15 דקות');
  expect(describeLeadMinutes(135, 'en')).toBe('2 hours 15 minutes');
  expect(describeLeadMinutes(60, 'en')).toBe('1 hour');
});
