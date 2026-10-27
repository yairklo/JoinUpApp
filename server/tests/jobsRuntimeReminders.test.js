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

  jest.advanceTimersByTime(FIVE_MIN);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(2);

  await f.lose();
  jest.advanceTimersByTime(FIVE_MIN * 2);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2); // stopped with the lock
});

test('a failing game sweep does not stop the tournament sweep (and vice versa)', async () => {
  const f = build({
    runGameReminders: jest.fn().mockRejectedValue(new Error('boom')),
  });
  const rt = createJobsRuntime(f.deps);
  await rt.start('IO');
  await f.acquire();
  jest.advanceTimersByTime(FIVE_MIN);
  expect(f.deps.runTournamentReminders).toHaveBeenCalledTimes(2);
  expect(f.deps.runGameReminders).toHaveBeenCalledTimes(2);
});
