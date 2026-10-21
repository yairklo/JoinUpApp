jest.mock('../lib/prisma', () => ({ prisma: {} }));

const { getAgeDefaults, resolvePrivacyLevel, canRequestFriendship } = require('../utils/privacy');

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

describe('canRequestFriendship', () => {
  const minor = yearsAgo(15);
  const adult = yearsAgo(30);

  test('a minor can request another minor on the default friends-only setting', () => {
    expect(canRequestFriendship({
      targetBirthDate: minor,
      targetPrivacyFriends: null,
      requesterBirthDate: minor,
    })).toBe(true);
  });

  test('an explicit friends-only choice still lets a minor request a minor', () => {
    expect(canRequestFriendship({
      targetBirthDate: minor,
      targetPrivacyFriends: 'FRIENDS_ONLY',
      requesterBirthDate: minor,
    })).toBe(true);
  });

  test('an adult cannot request a default minor', () => {
    expect(canRequestFriendship({
      targetBirthDate: minor,
      targetPrivacyFriends: null,
      requesterBirthDate: adult,
    })).toBe(false);
  });

  test('unknown age cannot request a default minor', () => {
    expect(canRequestFriendship({
      targetBirthDate: minor,
      targetPrivacyFriends: null,
      requesterBirthDate: null,
    })).toBe(false);
  });

  test('EVERYONE on a minor allows an adult', () => {
    expect(canRequestFriendship({
      targetBirthDate: minor,
      targetPrivacyFriends: 'EVERYONE',
      requesterBirthDate: adult,
    })).toBe(true);
  });

  test('an adult profile is not gated, even on friends-only', () => {
    expect(canRequestFriendship({
      targetBirthDate: adult,
      targetPrivacyFriends: 'FRIENDS_ONLY',
      requesterBirthDate: null,
    })).toBe(true);
  });
});
