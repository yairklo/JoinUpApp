import { defaultOptionLabel, privacyLevelLabel } from './privacyLabels';

const defaults = {
  privacyFriends: 'FRIENDS_ONLY' as const,
  privacyGames: 'EVERYONE' as const,
  privacyMessages: 'FRIENDS_ONLY' as const,
};

describe('privacyLevelLabel', () => {
  test('maps levels to Hebrew text', () => {
    expect(privacyLevelLabel('EVERYONE')).toBe('כולם');
    expect(privacyLevelLabel('FRIENDS_ONLY')).toBe('חברים בלבד');
  });
});

describe('defaultOptionLabel', () => {
  test('uses the age default text per field', () => {
    expect(defaultOptionLabel(defaults, 'privacyFriends')).toBe('חברים בלבד');
    expect(defaultOptionLabel(defaults, 'privacyGames')).toBe('כולם');
  });

  test('falls back to the generic label when ageDefaults is missing (older server)', () => {
    expect(defaultOptionLabel(undefined, 'privacyFriends')).toBe('ברירת מחדל');
    expect(defaultOptionLabel(null, 'privacyGames')).toBe('ברירת מחדל');
  });
});
