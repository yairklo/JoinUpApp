jest.mock('../lib/prisma', () => ({ prisma: {} }));

const { getAgeDefaults, resolvePrivacyLevel } = require('../utils/privacy');

const yearsAgo = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setDate(d.getDate() - 2);
  return d;
};

describe('getAgeDefaults', () => {
  test('minor defaults to FRIENDS_ONLY for every field', () => {
    expect(getAgeDefaults(yearsAgo(15))).toEqual({
      privacyFriends: 'FRIENDS_ONLY',
      privacyGames: 'FRIENDS_ONLY',
      privacyMessages: 'FRIENDS_ONLY',
    });
  });

  test('adult defaults to EVERYONE for every field', () => {
    expect(getAgeDefaults(yearsAgo(30))).toEqual({
      privacyFriends: 'EVERYONE',
      privacyGames: 'EVERYONE',
      privacyMessages: 'EVERYONE',
    });
  });

  test('unknown birthDate defaults to EVERYONE', () => {
    expect(getAgeDefaults(null).privacyFriends).toBe('EVERYONE');
  });

  test('ignores explicit stored values, unlike resolvePrivacyLevel', () => {
    const minor = yearsAgo(15);
    expect(resolvePrivacyLevel('EVERYONE', minor)).toBe('EVERYONE');
    expect(getAgeDefaults(minor).privacyFriends).toBe('FRIENDS_ONLY');
  });
});
