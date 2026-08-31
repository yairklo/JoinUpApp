const { resolveIsBanned } = require('../utils/admin');
const { mapAuthenticatedUser } = require('../utils/auth');

describe('resolveIsBanned', () => {
  test('is false when no metadata present', () => {
    expect(resolveIsBanned(null)).toEqual(false);
    expect(resolveIsBanned({ privateMetadata: {} })).toEqual(false);
  });

  test('honors Clerk privateMetadata.isBanned', () => {
    expect(resolveIsBanned({ privateMetadata: { isBanned: true } })).toEqual(true);
    expect(resolveIsBanned({ privateMetadata: { isBanned: 'true' } })).toEqual(true);
    expect(resolveIsBanned({ privateMetadata: { isBanned: false } })).toEqual(false);
  });
});

describe('mapAuthenticatedUser ban flag', () => {
  test('flags a banned user', () => {
    const user = mapAuthenticatedUser('user_1', { privateMetadata: { isBanned: true } });
    expect(user.isBanned).toEqual(true);
  });

  test('does not flag a normal user', () => {
    const user = mapAuthenticatedUser('user_1', { privateMetadata: {} });
    expect(user.isBanned).toEqual(false);
  });

  test('defaults to not banned when Clerk lookup failed', () => {
    const user = mapAuthenticatedUser('user_1', null);
    expect(user.isBanned).toEqual(false);
  });
});
