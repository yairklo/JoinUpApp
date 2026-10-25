/**
 * Unit tests for the per-message account recheck. Lookups are injected so this
 * never loads Clerk or Prisma.
 */
const { isSocketAccountClosed } = require('../utils/socketAccountGate');

describe('isSocketAccountClosed', () => {
  test('denies a missing user id without calling lookups', async () => {
    const getClerkUserCached = jest.fn();
    await expect(isSocketAccountClosed('', { getClerkUserCached })).resolves.toBe(false);
    await expect(isSocketAccountClosed(null, { getClerkUserCached })).resolves.toBe(false);
    expect(getClerkUserCached).not.toHaveBeenCalled();
  });

  test('fails open when the Clerk lookup is unavailable', async () => {
    await expect(isSocketAccountClosed('user_1', {})).resolves.toBe(false);
  });

  test('fails open when the Clerk lookup throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const deps = {
      getClerkUserCached: jest.fn().mockRejectedValue(new Error('clerk down')),
      isAccountDeleted: jest.fn(),
    };
    await expect(isSocketAccountClosed('user_1', deps)).resolves.toBe(false);
    expect(deps.isAccountDeleted).not.toHaveBeenCalled();
    console.warn.mockRestore();
  });

  test('closes a banned account', async () => {
    const deps = {
      getClerkUserCached: jest.fn().mockResolvedValue({ privateMetadata: { isBanned: true } }),
      isAccountDeleted: jest.fn(),
    };
    await expect(isSocketAccountClosed('user_1', deps)).resolves.toBe(true);
    expect(deps.isAccountDeleted).not.toHaveBeenCalled();
  });

  test('closes a deleted account that is not banned', async () => {
    const deps = {
      getClerkUserCached: jest.fn().mockResolvedValue({ privateMetadata: {} }),
      isAccountDeleted: jest.fn().mockResolvedValue(true),
    };
    await expect(isSocketAccountClosed('user_1', deps)).resolves.toBe(true);
    expect(deps.isAccountDeleted).toHaveBeenCalledWith('user_1');
  });

  test('leaves an open account connected', async () => {
    const deps = {
      getClerkUserCached: jest.fn().mockResolvedValue({ privateMetadata: { isBanned: false } }),
      isAccountDeleted: jest.fn().mockResolvedValue(false),
    };
    await expect(isSocketAccountClosed('user_1', deps)).resolves.toBe(false);
  });

  test('honors an injected ban check', async () => {
    const deps = {
      getClerkUserCached: jest.fn().mockResolvedValue({ id: 'user_1' }),
      isAccountDeleted: jest.fn(),
      resolveIsBanned: jest.fn().mockReturnValue(true),
    };
    await expect(isSocketAccountClosed('user_1', deps)).resolves.toBe(true);
    expect(deps.resolveIsBanned).toHaveBeenCalledWith({ id: 'user_1' });
  });
});
