const { createJobsRuntime } = require('../services/jobsRuntime');
const { MAX_SLEEP_MS } = require('../services/reminderScheduler');
const {
  DIRTY_KEY, DIRTY_TTL_MS, DIRTY_CHECK_MS, REDIS_OP_TIMEOUT_MS,
} = require('../services/reminderDirty');
const redisLib = require('../lib/redis');
const scheduler = require('../services/gameScheduler');

const quiet = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
const FIVE_MIN = 5 * 60 * 1000;

function build(overrides = {}) {
  const lock = {
    instanceId: 'I1', start: jest.fn(), stop: jest.fn().mockResolvedValue(undefined),
    status: () => ({ role: 'leader' }), isLeader: jest.fn(() => true),
  };
  let lockOpts;
  const deps = {
    enabled: true, httpEnabled: true, useLeaderLock: true,
    gameScheduler: {
      init: jest.fn(), setRunGuard: jest.fn(), loadAll: jest.fn().mockResolvedValue(undefined),
      triggerReviewQueue: jest.fn(), stop: jest.fn(),
    },
    prisma: {}, notificationService: {},
    startCleanupWorker: jest.fn(), stopCleanupWorker: jest.fn(),
    runWeeklySeriesGeneration: jest.fn().mockResolvedValue(undefined),
    runTournamentReminders: jest.fn().mockResolvedValue(undefined),
    runGameReminders: jest.fn().mockResolvedValue(undefined),
    createLeaderLock: jest.fn((o) => { lockOpts = o; return lock; }),
    getRedis: jest.fn(() => 'REDIS'),
    adapterEnabled: () => true,
    makeBridgeIo: jest.fn(),
    addShutdownHook: jest.fn(),
    ttlMs: 1000, logger: quiet,
    ...overrides,
  };
  return { deps, lock, acquire: () => lockOpts.onAcquire(), lose: () => lockOpts.onLose() };
}

jest.setTimeout(30000);
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

test('leader runs tournament AND game reminders at startup and every 5 minutes', async () => {
  const f = build();
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();

  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(1);
  expect(f.deps.runGameReminders).toHaveBeenCalledWith(expect.objectContaining({ io: 'IO', shouldContinue: expect.any(Function) }));
  expect(f.deps.runGameReminders.mock.calls[0][0].shouldContinue()).toBe(true);

  await jest.advanceTimersByTimeAsync(FIVE_MIN);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(2);

  await f.lose();
  await jest.advanceTimersByTimeAsync(FIVE_MIN * 2);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2); // stopped with the lock
});

test('with a wake planner the runtime sleeps (no 5-minute polling) until the planned time', async () => {
  const wakeAt = Date.now() + 3 * 60 * 60 * 1000;
  const planReminderWake = jest.fn().mockResolvedValueOnce(wakeAt).mockResolvedValue(null);
  const f = build({ planReminderWake });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await jest.advanceTimersByTimeAsync(0);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1); // boot sweep only

  await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(60 * 60 * 1000 + 1000);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(2);
});

test('losing the lock unregisters the nudge and stops the reminder driver', async () => {
  const f = build({ planReminderWake: jest.fn().mockResolvedValue(Date.now() + FIVE_MIN) });
  f.deps.gameScheduler.setReminderNudge = jest.fn();
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  expect(f.deps.gameScheduler.setReminderNudge).toHaveBeenCalledWith(expect.any(Function));
  await f.lose();
  expect(f.deps.gameScheduler.setReminderNudge).toHaveBeenLastCalledWith(null);
  await jest.advanceTimersByTimeAsync(FIVE_MIN * 3);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
});

test('a failing sweep is logged, not silently swallowed', async () => {
  const boom = new Error('boom');
  const f = build({ runGameReminders: jest.fn().mockRejectedValue(boom) });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await Promise.resolve(); await Promise.resolve();
  expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('game reminder sweep failed'), boom);
});

test('a throwing runner backs off instead of sweeping every minute while the failure lasts', async () => {
  const planReminderWake = jest.fn(async () => Date.now() - 1000);
  const f = build({
    planReminderWake,
    runGameReminders: jest.fn().mockRejectedValue(new Error('boom')),
    runTournamentReminders: jest.fn().mockResolvedValue({ reminded: 0 }),
  });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await jest.advanceTimersByTimeAsync(0);
  await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
  expect(f.deps.runGameReminders.mock.calls.length).toBeLessThanOrEqual(3);
  expect(f.deps.runTournamentReminders.mock.calls.length).toBe(f.deps.runGameReminders.mock.calls.length);
});

test('leader-lock with nothing upcoming sweeps and plans once at start, then once at 6h', async () => {
  const planReminderWake = jest.fn().mockResolvedValue(null);
  const f = build({ planReminderWake });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await jest.advanceTimersByTimeAsync(0);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(1);
  expect(planReminderWake).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(1);
  expect(planReminderWake).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(2);
  expect(planReminderWake).toHaveBeenCalledTimes(2);
  await f.lose();
});

function makeFakeRedis() {
  const data = new Map();
  return {
    data,
    set: jest.fn(async (key, val, px, ttl) => {
      data.set(key, { val, px, ttl: Number(ttl), exp: Date.now() + Number(ttl) });
      return 'OK';
    }),
    get: jest.fn(async (key) => {
      const entry = data.get(key);
      if (!entry || entry.exp <= Date.now()) return null;
      return entry.val;
    }),
    del: jest.fn(async (key) => (data.delete(key) ? 1 : 0)),
  };
}

test('a lost non-leader nudge sets the dirty key and the leader replans within one check, without prisma', async () => {
  expect(DIRTY_CHECK_MS).toBe(60 * 1000);
  expect(DIRTY_TTL_MS).toBe(MAX_SLEEP_MS);
  const fake = makeFakeRedis();
  const redisSpy = jest.spyOn(redisLib, 'getRedis').mockReturnValue(fake);
  const touches = [];
  const prisma = new Proxy({}, {
    get(_target, prop) {
      touches.push(String(prop));
      return () => undefined;
    },
  });
  const planReminderWake = jest.fn(async () => Date.now() + 5 * 60 * 60 * 1000);
  const f = build({
    planReminderWake,
    prisma,
    getRedis: () => fake,
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const rt = createJobsRuntime(f.deps);
    await rt.start('IO');
    await f.acquire();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
    expect(planReminderWake).toHaveBeenCalledTimes(1);
    expect(fake.del.mock.invocationCallOrder[0]).toBeLessThan(
      f.deps.runGameReminders.mock.invocationCallOrder[0],
    );
    expect(touches).toEqual([]);

    scheduler.stop();
    scheduler.setPublisher(() => Promise.reject(new Error('redis down')));
    scheduler.nudgeReminders();
    await jest.advanceTimersByTimeAsync(0);
    expect(fake.set).toHaveBeenCalledWith(DIRTY_KEY, '1', 'PX', DIRTY_TTL_MS);
    expect(fake.data.get(DIRTY_KEY).val).toBe('1');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reminder wake publish failed'), expect.any(Error));

    await jest.advanceTimersByTimeAsync(DIRTY_CHECK_MS - 1);
    expect(fake.get).not.toHaveBeenCalled();
    expect(planReminderWake).toHaveBeenCalledTimes(1);
    expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
    expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(1);
    expect(touches).toEqual([]);

    await jest.advanceTimersByTimeAsync(1);
    expect(fake.get).toHaveBeenCalledTimes(1);
    expect(fake.get.mock.invocationCallOrder[0]).toBeLessThan(
      fake.del.mock.invocationCallOrder[fake.del.mock.invocationCallOrder.length - 1],
    );
    expect(fake.data.has(DIRTY_KEY)).toBe(false);
    expect(planReminderWake).toHaveBeenCalledTimes(1);
    expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
    expect(touches).toEqual([]);

    await jest.advanceTimersByTimeAsync(1000);
    expect(planReminderWake).toHaveBeenCalledTimes(2);
    expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
    expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(1);
    expect(touches).toEqual([]);

    await jest.advanceTimersByTimeAsync(DIRTY_CHECK_MS);
    expect(planReminderWake).toHaveBeenCalledTimes(2);
    expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
    expect(touches).toEqual([]);
    await f.lose();
  } finally {
    log.mockRestore();
    redisSpy.mockRestore();
    scheduler.stop();
    scheduler.setPublisher(null);
    scheduler.setReminderNudge(null);
  }
});

test('leader clears a stale dirty key before the first sweep and does not replan for it', async () => {
  const fake = makeFakeRedis();
  fake.data.set(DIRTY_KEY, { val: '1', px: 'PX', ttl: DIRTY_TTL_MS, exp: Date.now() + DIRTY_TTL_MS });
  const planReminderWake = jest.fn(async () => Date.now() + 5 * 60 * 60 * 1000);
  const f = build({ planReminderWake, getRedis: () => fake });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await jest.advanceTimersByTimeAsync(0);
  expect(fake.data.has(DIRTY_KEY)).toBe(false);
  expect(fake.del.mock.invocationCallOrder[0]).toBeLessThan(f.deps.runGameReminders.mock.invocationCallOrder[0]);
  expect(planReminderWake).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(DIRTY_CHECK_MS + 1000);
  expect(planReminderWake).toHaveBeenCalledTimes(1);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
  await f.lose();
});

test('a hanging dirty-flag read times out without a planner call and does not tight-loop', async () => {
  const fake = makeFakeRedis();
  fake.data.set(DIRTY_KEY, { val: '1', px: 'PX', ttl: DIRTY_TTL_MS, exp: Date.now() + DIRTY_TTL_MS });
  fake.get.mockImplementationOnce(() => new Promise(() => {}));
  const planReminderWake = jest.fn(async () => Date.now() + 5 * 60 * 60 * 1000);
  const f = build({ planReminderWake, getRedis: () => fake });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await jest.advanceTimersByTimeAsync(0);
  // start cleared the key; put it back so the hanging read is the one that matters
  fake.data.set(DIRTY_KEY, { val: '1', px: 'PX', ttl: DIRTY_TTL_MS, exp: Date.now() + DIRTY_TTL_MS });
  expect(planReminderWake).toHaveBeenCalledTimes(1);

  const delsAtStart = fake.del.mock.calls.length;
  await jest.advanceTimersByTimeAsync(DIRTY_CHECK_MS);
  expect(fake.get).toHaveBeenCalledTimes(1);
  expect(planReminderWake).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(REDIS_OP_TIMEOUT_MS);
  expect(quiet.error).toHaveBeenCalledWith(
    expect.stringContaining('dirty flag check failed'),
    expect.objectContaining({ message: 'redis timeout' }),
  );
  expect(fake.data.has(DIRTY_KEY)).toBe(true);
  expect(fake.del).toHaveBeenCalledTimes(delsAtStart);
  expect(planReminderWake).toHaveBeenCalledTimes(1);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);

  const reads = fake.get.mock.calls.length;
  await jest.advanceTimersByTimeAsync(1000);
  expect(fake.get).toHaveBeenCalledTimes(reads);
  await jest.advanceTimersByTimeAsync(DIRTY_CHECK_MS + 1500);
  expect(fake.get.mock.calls.length).toBe(reads + 1);
  expect(planReminderWake).toHaveBeenCalledTimes(2);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(1);
  await f.lose();
});

test('a failing game sweep does not stop the tournament sweep (and vice versa)', async () => {
  const f = build({
    runGameReminders: jest.fn().mockRejectedValue(new Error('boom')),
  });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  await jest.advanceTimersByTimeAsync(FIVE_MIN);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(2);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2);
});
