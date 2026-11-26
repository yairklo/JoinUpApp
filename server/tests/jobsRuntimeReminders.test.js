const { createJobsRuntime } = require('../services/jobsRuntime');

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

test('leader-lock with nothing upcoming re-plans within 15 minutes, and a known wake is left alone', async () => {
  const idlePlan = jest.fn().mockResolvedValue(null);
  const idle = build({ planReminderWake: idlePlan });
  const idleRt = createJobsRuntime(idle.deps);
  await idleRt.start('IO');
  await idle.acquire();
  await jest.advanceTimersByTimeAsync(0);
  expect(idle.deps.runGameReminders).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
  expect(idle.deps.runGameReminders).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(60 * 1000);
  expect(idle.deps.runGameReminders).toHaveBeenCalledTimes(2);

  const later = Date.now() + 3 * 60 * 60 * 1000;
  const planned = build({ planReminderWake: jest.fn().mockResolvedValue(later) });
  const plannedRt = createJobsRuntime(planned.deps);
  await plannedRt.start('IO');
  await planned.acquire();
  await jest.advanceTimersByTimeAsync(0);
  await jest.advanceTimersByTimeAsync(15 * 60 * 1000);
  expect(planned.deps.runGameReminders).toHaveBeenCalledTimes(1);
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
