describe('lib/redis', () => {
  const saved = process.env.REDIS_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = saved;
    jest.resetModules();
  });

  test('returns null helpers without REDIS_URL and does not connect at require time', () => {
    delete process.env.REDIS_URL;
    jest.resetModules();
    const ctor = jest.fn();
    jest.doMock('ioredis', () => ctor);
    const redis = require('../lib/redis');
    expect(ctor).not.toHaveBeenCalled();
    expect(redis.getRedis()).toBeNull();
    expect(redis.createClient()).toBeNull();
    expect(redis.createAdapterClients()).toBeNull();
    expect(redis.isRedisHealthy()).toBe(false);
  });

  test('retry strategy is infinite and capped', () => {
    const { retryStrategy } = require('../lib/redis');
    expect(retryStrategy(1)).toBe(200);
    expect(retryStrategy(10)).toBe(2000);
    expect(retryStrategy(1000)).toBe(3000);
    expect(retryStrategy(1_000_000)).toBe(3000);
  });

  test('keys are namespaced', () => {
    const { key } = require('../lib/redis');
    expect(key('rl', 'read', '1.2.3.4')).toBe('joinup:rl:read:1.2.3.4');
  });

  test('createClient builds an ioredis client with fail-fast options and error handler', () => {
    jest.resetModules();
    const handlers = {};
    const ctor = jest.fn(() => ({ on: (e, h) => { handlers[e] = h; }, duplicate: jest.fn() }));
    jest.doMock('ioredis', () => ctor);
    const redis = require('../lib/redis');
    const c = redis.createClient({ url: 'redis://x:1', failFast: true });
    expect(c).toBeTruthy();
    const opts = ctor.mock.calls[0][1];
    expect(opts.enableOfflineQueue).toBe(false);
    expect(opts.retryStrategy(500)).toBe(3000);
    expect(() => handlers.error(new Error('boom'))).not.toThrow();
    expect(redis.isRedisHealthy()).toBe(false);
    handlers.ready();
    expect(redis.isRedisHealthy()).toBe(true);
  });
});
