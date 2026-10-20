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
  test('uses the age default text per field, marked as the default', () => {
    expect(defaultOptionLabel(defaults, 'privacyFriends')).toBe('חברים בלבד (ברירת מחדל)');
    expect(defaultOptionLabel(defaults, 'privacyGames')).toBe('כולם (ברירת מחדל)');
  });

  test('never reads the same as the explicit option for that level', () => {
    expect(defaultOptionLabel(defaults, 'privacyGames')).not.toBe(privacyLevelLabel('EVERYONE'));
    expect(defaultOptionLabel(defaults, 'privacyFriends')).not.toBe(privacyLevelLabel('FRIENDS_ONLY'));
  });

  test('falls back to the generic label when ageDefaults is missing (older server)', () => {
    expect(defaultOptionLabel(undefined, 'privacyFriends')).toBe('ברירת מחדל');
    expect(defaultOptionLabel(null, 'privacyGames')).toBe('ברירת מחדל');
  });
});
