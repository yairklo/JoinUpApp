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
