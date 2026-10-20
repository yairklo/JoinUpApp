const { createLeaderLock } = require('../services/leaderLock');

// Minimal in-memory Redis that understands the two Lua scripts and SET NX PX, with TTLs driven
// by Date.now() (which jest fake timers control).
class FakeRedis {
  constructor() { this.store = new Map(); this.down = false; }
  _live(key) {
    const e = this.store.get(key);
    if (e && e.exp <= Date.now()) { this.store.delete(key); return null; }
    return e || null;
  }
  async set(key, val, _px, ttl, nx) {
    if (this.down) throw new Error('ECONNREFUSED');
    if (nx === 'NX' && this._live(key)) return null;
    this.store.set(key, { val, exp: Date.now() + Number(ttl) });
    return 'OK';
  }
  async eval(script, _n, key, id, ttl) {
    if (this.down) throw new Error('ECONNREFUSED');
    const e = this._live(key);
    if (!e || e.val !== id) return 0;
    if (script.includes('pexpire')) { e.exp = Date.now() + Number(ttl); return 1; }
    this.store.delete(key);
    return 1;
  }
  holder(key) { const e = this._live(key); return e && e.val; }
}

const quiet = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const KEY = 'test:leader';

function make(redis, id, hooks = {}) {
  return createLeaderLock({
    client: redis, lockKey: KEY, instanceId: id, ttlMs: 30_000, renewMs: 10_000, marginMs: 5_000,
    logger: quiet, onAcquire: hooks.onAcquire || jest.fn(), onLose: hooks.onLose || jest.fn(),
  });
}

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

const advance = (ms) => jest.advanceTimersByTimeAsync(ms);

test('first instance acquires and runs onAcquire; the second stays standby', async () => {
  const redis = new FakeRedis();
  const a = { onAcquire: jest.fn(), onLose: jest.fn() };
  const b = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', a);
  const lb = make(redis, 'B', b);
  la.start();
  await advance(1);
  lb.start();
  await advance(1);
  expect(la.isLeader()).toBe(true);
  expect(lb.isLeader()).toBe(false);
  expect(a.onAcquire).toHaveBeenCalledTimes(1);
  expect(b.onAcquire).not.toHaveBeenCalled();
  expect(redis.holder(KEY)).toBe('A');
  await la.stop(); await lb.stop();
});

test('leader renews well past the original TTL', async () => {
  const redis = new FakeRedis();
  const hooks = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', hooks);
  la.start();
  await advance(200_000); // ~6.7 TTLs
  expect(la.isLeader()).toBe(true);
  expect(redis.holder(KEY)).toBe('A');
  expect(hooks.onAcquire).toHaveBeenCalledTimes(1);
  expect(hooks.onLose).not.toHaveBeenCalled();
  await la.stop();
});

test('loss: lock deleted/taken by another instance => onLose, no jobs left running', async () => {
  const redis = new FakeRedis();
  const hooks = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', hooks);
  la.start();
  await advance(1);
  redis.store.set(KEY, { val: 'INTRUDER', exp: Date.now() + 30_000 });
  await advance(10_001);
  expect(la.isLeader()).toBe(false);
  expect(hooks.onLose).toHaveBeenCalledTimes(1);
  expect(redis.holder(KEY)).toBe('INTRUDER'); // we never touch a lock we do not own
  await la.stop();
});

test('takeover: a leader cut off from Redis stops itself, then the standby acquires after the TTL', async () => {
  const redis = new FakeRedis();
  const aView = Object.create(redis); // same store, separately switchable connectivity
  aView.down = false;
  const a = { onAcquire: jest.fn(), onLose: jest.fn() };
  const b = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(aView, 'A', a);
  const lb = make(redis, 'B', b);
  la.start();
  await advance(1);
  lb.start();
  await advance(1);
  expect(la.isLeader()).toBe(true);
  aView.down = true; // A can no longer renew (partition / crash)
  await advance(29_000);
  expect(lb.isLeader()).toBe(false);
  await advance(2_000); // key expired at t=30s; B retry follows
  await advance(10_000);
  expect(redis.holder(KEY)).toBe('B');
  expect(lb.isLeader()).toBe(true);
  expect(b.onAcquire).toHaveBeenCalledTimes(1);
  // A stopped its own jobs before B started (no overlap window).
  expect(a.onLose).toHaveBeenCalledTimes(1);
  expect(la.isLeader()).toBe(false);
  await la.stop(); await lb.stop();
});

test('graceful release: stop() runs onLose and the standby takes over on its next retry', async () => {
  const redis = new FakeRedis();
  const a = { onAcquire: jest.fn(), onLose: jest.fn() };
  const b = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', a);
  const lb = make(redis, 'B', b);
  la.start();
  await advance(1);
  lb.start();
  await advance(1);
  await la.stop();
  expect(a.onLose).toHaveBeenCalledTimes(1);
  expect(redis.holder(KEY)).toBeNull();
  await advance(10_001); // B retry interval, far below the 30s TTL
  expect(lb.isLeader()).toBe(true);
  expect(b.onAcquire).toHaveBeenCalledTimes(1);
  await lb.stop();
});

test('Redis down while leading: jobs keep running until the local lease ends, then stop', async () => {
  const redis = new FakeRedis();
  const hooks = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', hooks);
  la.start();
  await advance(1);
  redis.down = true;
  await advance(10_000); // renewal fails, lease (25s) still valid
  expect(la.isLeader()).toBe(true);
  expect(hooks.onLose).not.toHaveBeenCalled();
  await advance(20_000); // past lastRenew + ttl - margin
  expect(la.isLeader()).toBe(false);
  expect(hooks.onLose).toHaveBeenCalledTimes(1);
  // Redis back and the key long expired: the same instance can lead again.
  redis.down = false;
  await advance(10_001);
  expect(la.isLeader()).toBe(true);
  expect(hooks.onAcquire).toHaveBeenCalledTimes(2);
  await la.stop();
});

test('Redis down from the start: standby never throws, never runs jobs, acquires when Redis returns', async () => {
  const redis = new FakeRedis();
  redis.down = true;
  const hooks = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', hooks);
  la.start();
  await advance(35_000);
  expect(la.isLeader()).toBe(false);
  expect(hooks.onAcquire).not.toHaveBeenCalled();
  redis.down = false;
  await advance(10_001);
  expect(la.isLeader()).toBe(true);
  await la.stop();
});

test('onAcquire failure steps down and releases the lock for another instance', async () => {
  const redis = new FakeRedis();
  const bad = { onAcquire: jest.fn().mockRejectedValue(new Error('db down')), onLose: jest.fn() };
  const good = { onAcquire: jest.fn(), onLose: jest.fn() };
  const la = make(redis, 'A', bad);
  la.start();
  await advance(1);
  expect(la.isLeader()).toBe(false);
  expect(bad.onLose).toHaveBeenCalledTimes(1);
  expect(redis.holder(KEY)).toBeNull();
  const lb = make(redis, 'B', good);
  lb.start();
  await advance(1);
  expect(lb.isLeader()).toBe(true);
  await la.stop(); await lb.stop();
});

test('requires a client', () => {
  expect(() => createLeaderLock({})).toThrow();
});
