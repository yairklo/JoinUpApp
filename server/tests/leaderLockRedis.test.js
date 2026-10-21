/**
 * Job leader lock against a real Redis (skipped without TEST_REDIS_URL): real SET NX PX, real Lua
 * compare-and-renew / compare-and-delete, real expiry. Short TTLs keep it fast.
 */
const { createLeaderLock } = require('../services/leaderLock');
const { describeRedis, newClient, uniqueId, sleep, waitFor } = require('./helpers/redisTest');

const quiet = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

describeRedis('leader lock (real Redis)', () => {
  let client; let key; let locks;

  const make = (id, hooks = {}) => {
    const lock = createLeaderLock({
      client, lockKey: key, instanceId: id, ttlMs: 600, renewMs: 150, marginMs: 100,
      logger: quiet, onAcquire: hooks.onAcquire || jest.fn(), onLose: hooks.onLose || jest.fn(),
    });
    locks.push(lock);
    return lock;
  };

  beforeAll(() => { client = newClient(); });
  beforeEach(() => { key = `joinup:${uniqueId('leader')}`; locks = []; });
  afterEach(async () => {
    for (const l of locks) await l.stop();
    await client.del(key);
  });
  afterAll(() => client.disconnect());

  test('exactly one of two contenders leads, and keeps leading across many TTLs', async () => {
    const a = make('A'); const b = make('B');
    a.start(); b.start();
    await waitFor(() => a.isLeader() || b.isLeader());
    await sleep(1500); // > 2 TTLs: only renewal can keep the key alive
    expect([a.isLeader(), b.isLeader()].filter(Boolean)).toHaveLength(1);
    const holder = await client.get(key);
    expect(holder).toBe(a.isLeader() ? 'A' : 'B');
  });

  test('takeover when the leader key vanishes: old leader stops before/when the new one starts', async () => {
    const events = [];
    const a = make('A', { onAcquire: () => events.push('A+'), onLose: () => events.push('A-') });
    a.start();
    await waitFor(() => a.isLeader());
    await client.set(key, 'INTRUDER', 'PX', 5000); // someone else holds the lock now
    await waitFor(() => !a.isLeader());
    expect(events).toEqual(['A+', 'A-']);
    expect(await client.get(key)).toBe('INTRUDER'); // compare-and-renew never touched a foreign lock
  });

  test('graceful stop releases at once so the standby takes over well inside the TTL', async () => {
    const a = make('A'); const b = make('B');
    a.start();
    await waitFor(() => a.isLeader());
    b.start();
    await sleep(200);
    expect(b.isLeader()).toBe(false);
    const t0 = Date.now();
    await a.stop();
    expect(await client.get(key)).toBeNull();
    await waitFor(() => b.isLeader(), { timeout: 3000 });
    expect(Date.now() - t0).toBeLessThan(600); // sooner than waiting out the TTL
  });

  test('a crashed leader (no renewals, no release) is replaced after the TTL', async () => {
    await client.set(key, 'DEAD', 'PX', 300);
    const b = make('B');
    b.start();
    await sleep(100);
    expect(b.isLeader()).toBe(false);
    await waitFor(() => b.isLeader(), { timeout: 3000 });
    expect(await client.get(key)).toBe('B');
  });

  test('release (compare-and-delete) never deletes a lock held by someone else', async () => {
    const a = make('A');
    a.start();
    await waitFor(() => a.isLeader());
    await client.set(key, 'OTHER', 'PX', 5000);
    await a.stop();
    expect(await client.get(key)).toBe('OTHER');
  });
});
