const { createJobsRuntime } = require('../services/jobsRuntime');
const { createLeaderLock } = require('../services/leaderLock');
const { describeRedis, newClient, uniqueId, waitFor } = require('./helpers/redisTest');

const quiet = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

function fakes(overrides = {}) {
  const scheduler = {
    init: jest.fn(), setRunGuard: jest.fn(), loadAll: jest.fn().mockResolvedValue(undefined),
    triggerReviewQueue: jest.fn(), stop: jest.fn(),
  };
  const hooks = [];
  const series = jest.fn().mockResolvedValue(undefined);
  const lockOpts = [];
  const lock = { instanceId: 'I1', start: jest.fn(), stop: jest.fn().mockResolvedValue(undefined), status: () => ({ role: 'standby' }), isLeader: jest.fn(() => true) };
  const deps = {
    enabled: true, httpEnabled: true, useLeaderLock: false,
    gameScheduler: scheduler, prisma: {}, notificationService: {},
    startCleanupWorker: jest.fn(), stopCleanupWorker: jest.fn(),
    runWeeklySeriesGeneration: series,
    createLeaderLock: jest.fn((o) => { lockOpts.push(o); return lock; }),
    getRedis: jest.fn(() => 'REDIS'),
    adapterEnabled: () => false,
    makeBridgeIo: jest.fn(() => 'BRIDGE_IO'),
    addShutdownHook: (h) => hooks.push(h),
    ttlMs: 1234, logger: quiet,
    ...overrides,
  };
  return { deps, scheduler, hooks, series, lock, lockOpts };
}

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

test('disabled: nothing starts and no lock is created', async () => {
  const f = fakes({ enabled: false });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  expect(f.scheduler.init).not.toHaveBeenCalled();
  expect(f.deps.createLeaderLock).not.toHaveBeenCalled();
  expect(rt.state().mode).toBe('off');
});

test('direct mode: jobs start immediately, no run guard, stop clears timers and the cron', async () => {
  const f = fakes();
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  expect(f.scheduler.init).toHaveBeenCalledWith(expect.objectContaining({ io: 'IO' }));
  expect(f.scheduler.setRunGuard).toHaveBeenCalledWith(null);
  expect(f.scheduler.loadAll).toHaveBeenCalled();
  expect(f.deps.startCleanupWorker).toHaveBeenCalled();
  expect(f.scheduler.triggerReviewQueue).toHaveBeenCalled();
  expect(f.series).toHaveBeenCalledTimes(1);
  expect(f.hooks.map((h) => h[0])).toEqual(['jobs']);
  expect(rt.state()).toMatchObject({ active: true, mode: 'direct' });

  jest.advanceTimersByTime(24 * 3600 * 1000);
  expect(f.series).toHaveBeenCalledTimes(2); // daily run
  await rt.stop();
  expect(f.scheduler.stop).toHaveBeenCalled();
  expect(f.deps.stopCleanupWorker).toHaveBeenCalled();
  jest.advanceTimersByTime(48 * 3600 * 1000);
  expect(f.series).toHaveBeenCalledTimes(2); // interval cleared
  expect(rt.state().active).toBe(false);
});

describe('leader lock mode', () => {
  const lockMode = { useLeaderLock: true };

  test('competes for the lock with the Redis client and TTL; nothing runs until acquired', async () => {
    const f = fakes(lockMode);
    const rt = createJobsRuntime(f.deps);
    await rt.start('IO');
    expect(f.lockOpts[0]).toMatchObject({ client: 'REDIS', ttlMs: 1234 });
    expect(f.lock.start).toHaveBeenCalled();
    expect(f.scheduler.init).not.toHaveBeenCalled();
    expect(f.hooks.map((h) => h[0])).toEqual(['job leader lock']);
    expect(rt.state()).toMatchObject({ active: false, mode: 'leader-lock' });
  });

  test('onAcquire starts jobs with a leader guard; onLose stops everything', async () => {
    const f = fakes(lockMode);
    const rt = createJobsRuntime(f.deps);
    await rt.start('IO');
    await f.lockOpts[0].onAcquire();
    expect(f.scheduler.loadAll).toHaveBeenCalled();
    const guard = f.scheduler.setRunGuard.mock.calls[0][0];
    f.lock.isLeader.mockReturnValue(false);
    expect(guard()).toBe(false); // frozen/deposed process: timers must not run
    expect(rt.state().active).toBe(true);

    // series generation is told to stop as soon as leadership is gone
    const shouldContinue = f.series.mock.calls[0][0].shouldContinue;
    expect(shouldContinue()).toBe(false);
    f.lock.isLeader.mockReturnValue(true);
    expect(shouldContinue()).toBe(true);

    await f.lockOpts[0].onLose();
    expect(f.scheduler.stop).toHaveBeenCalled();
    expect(f.deps.stopCleanupWorker).toHaveBeenCalled();
    expect(shouldContinue()).toBe(false);
    expect(rt.state().active).toBe(false);
  });

  test('job io: bridge when HTTP without adapter, real io with adapter, given io for worker.js', async () => {
    let f = fakes(lockMode);
    await createJobsRuntime(f.deps).start('IO');
    await f.lockOpts[0].onAcquire();
    expect(f.scheduler.init).toHaveBeenLastCalledWith(expect.objectContaining({ io: 'BRIDGE_IO' }));

    f = fakes({ ...lockMode, adapterEnabled: () => true });
    await createJobsRuntime(f.deps).start('IO');
    await f.lockOpts[0].onAcquire();
    expect(f.scheduler.init).toHaveBeenLastCalledWith(expect.objectContaining({ io: 'IO' }));

    f = fakes({ ...lockMode, httpEnabled: false });
    await createJobsRuntime(f.deps).start('WORKER_BRIDGE_IO');
    await f.lockOpts[0].onAcquire();
    expect(f.scheduler.init).toHaveBeenLastCalledWith(expect.objectContaining({ io: 'WORKER_BRIDGE_IO' }));
  });

  test('shutdown hook releases the lock', async () => {
    const f = fakes(lockMode);
    await createJobsRuntime(f.deps).start('IO');
    await f.hooks[0][1]();
    expect(f.lock.stop).toHaveBeenCalled();
  });
});

describeRedis('two runtimes competing on real Redis', () => {
  beforeEach(() => { jest.useRealTimers(); });

  test('exactly one runs jobs; a graceful stop hands over to the other, and jobs never overlap', async () => {
    const client = newClient();
    const key = `joinup:${uniqueId('rt')}`;
    const running = new Set();
    let overlap = false;
    const mk = (name) => {
      const scheduler = {
        init: jest.fn(), setRunGuard: jest.fn(), triggerReviewQueue: jest.fn(),
        loadAll: jest.fn(async () => { running.add(name); if (running.size > 1) overlap = true; }),
        stop: jest.fn(() => { running.delete(name); }),
      };
      return createJobsRuntime({
        enabled: true, httpEnabled: true, useLeaderLock: true, gameScheduler: scheduler, prisma: {},
        notificationService: {}, startCleanupWorker: jest.fn(), stopCleanupWorker: jest.fn(),
        runWeeklySeriesGeneration: jest.fn().mockResolvedValue(undefined),
        createLeaderLock: (o) => createLeaderLock({ ...o, lockKey: key, ttlMs: 600, renewMs: 150, marginMs: 100, logger: quiet }),
        getRedis: () => client, makeBridgeIo: () => null, logger: quiet,
      });
    };
    const a = mk('A'); const b = mk('B');
    try {
      await a.start('IO'); await b.start('IO');
      await waitFor(() => running.size === 1);
      const first = a.state().active ? a : b;
      const second = first === a ? b : a;
      await new Promise((r) => setTimeout(r, 900)); // > a TTL: still exactly one, via renewals
      expect(running.size).toBe(1);
      await first.stop();
      await waitFor(() => second.state().active, { timeout: 3000 });
      expect(running.size).toBe(1);
      expect(overlap).toBe(false);
      await second.stop();
    } finally {
      await a.stop(); await b.stop();
      await client.del(key);
      client.disconnect();
    }
  });
});
