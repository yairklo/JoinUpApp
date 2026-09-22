// Unit tests for the per-process Clerk user cache in utils/auth.js. No DB, no network:
// createClerkClient is mocked so getUser is a plain jest.fn.
const mockGetUser = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ users: { getUser: (...args) => mockGetUser(...args) } }),
}));
jest.mock('@clerk/express', () => ({
  requireAuth: () => (_req, _res, next) => next(),
}));

const { getClerkUserCached, invalidateClerkUser, clearClerkUserCache } = require('../utils/auth');

describe('getClerkUserCached', () => {
  beforeEach(() => {
    clearClerkUserCache();
    mockGetUser.mockReset();
    mockGetUser.mockImplementation(async (id) => ({ id }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('sequential lookups for the same user hit Clerk once', async () => {
    await expect(getClerkUserCached('u1')).resolves.toEqual({ id: 'u1' });
    await expect(getClerkUserCached('u1')).resolves.toEqual({ id: 'u1' });
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  test('concurrent lookups for the same user share one Clerk call', async () => {
    const [a, b] = await Promise.all([getClerkUserCached('u1'), getClerkUserCached('u1')]);
    expect(a).toEqual({ id: 'u1' });
    expect(b).toEqual({ id: 'u1' });
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  test('different users are cached separately', async () => {
    await getClerkUserCached('u1');
    await getClerkUserCached('u2');
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('a failed lookup is not cached; the next call retries', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('Clerk down'));
    await expect(getClerkUserCached('u1')).rejects.toThrow('Clerk down');
    await expect(getClerkUserCached('u1')).resolves.toEqual({ id: 'u1' });
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('invalidateClerkUser forces a refetch', async () => {
    await getClerkUserCached('u1');
    invalidateClerkUser('u1');
    await getClerkUserCached('u1');
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('entries expire after the TTL', async () => {
    // lru-cache memoizes "now" for 1ms (ttlResolution) via a real timer set by earlier tests;
    // let it lapse before faking time, or the memoized clock freezes this test's reads.
    await new Promise((resolve) => setTimeout(resolve, 5));
    jest.useFakeTimers({ doNotFake: ['performance'] });
    // lru-cache holds the real `performance` object captured at load, so drive its clock from
    // the faked Date instead.
    jest.spyOn(performance, 'now').mockImplementation(() => Date.now());
    await getClerkUserCached('u1');
    jest.advanceTimersByTime(29_000);
    await getClerkUserCached('u1');
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2_000);
    await getClerkUserCached('u1');
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });
});
