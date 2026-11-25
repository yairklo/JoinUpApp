const { createReminderScheduler } = require('../services/reminderScheduler');
const { planNextReminderWake } = require('../services/reminderWake');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const quiet = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

describe('createReminderScheduler', () => {
  test('sweeps at start, then sleeps until the planned time with no polling in between', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const planNextWake = jest.fn()
      .mockResolvedValueOnce(Date.now() + 6 * HOUR)
      .mockResolvedValue(null);
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(5 * HOUR);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(planNextWake).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(HOUR + 2000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  test('a planner answering "now" cannot cause a back-to-back sweep loop', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, planNextWake: jest.fn(async () => Date.now()), logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep.mock.calls.length).toBeLessThanOrEqual(11);
  });

  test('a null plan (nothing upcoming) arms no timer at all', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, planNextWake: jest.fn().mockResolvedValue(null), logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(48 * HOUR);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test('a nudge pulls the wake earlier but never pushes it later', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const plans = [Date.now() + 10 * HOUR];
    const planNextWake = jest.fn(async () => plans[0]);
    const s = createReminderScheduler({ sweep, planNextWake, debounceMs: 1000, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt).toBe(plans[0]);

    plans[0] = Date.now() + 2 * HOUR; // e.g. a game was added that starts sooner
    const earlier = plans[0];
    s.nudge();
    await jest.advanceTimersByTimeAsync(1500);
    expect(s.state().nextWakeAt).toBe(earlier);

    plans[0] = Date.now() + 30 * HOUR; // a later plan must not delay the armed wake
    s.nudge();
    await jest.advanceTimersByTimeAsync(1500);
    expect(s.state().nextWakeAt).toBe(earlier);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test('nudges are debounced into one replan', async () => {
    const planNextWake = jest.fn().mockResolvedValue(Date.now() + 9 * HOUR);
    const s = createReminderScheduler({ sweep: jest.fn().mockResolvedValue(undefined), planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    planNextWake.mockClear();
    s.nudge(); s.nudge(); s.nudge();
    await jest.advanceTimersByTimeAsync(2000);
    expect(planNextWake).toHaveBeenCalledTimes(1);
  });

  test('stop() cancels the pending wake and ignores later nudges', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, planNextWake: jest.fn().mockResolvedValue(Date.now() + HOUR), logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    s.stop();
    s.nudge();
    await jest.advanceTimersByTimeAsync(3 * HOUR);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a failing sweep or planner is logged and retried on the active cadence', async () => {
    const sweep = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const planNextWake = jest.fn().mockRejectedValue(new Error('db down'));
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(5 * MIN + 1000);
    expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('sweep failed'), expect.any(Error));
    expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('planning'), expect.any(Error));
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  test('does not sweep when the leader guard says no', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, shouldContinue: () => false, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep).not.toHaveBeenCalled();
  });
});

describe('planNextReminderWake', () => {
  const now = new Date('2026-11-24T10:00:00Z');
  function prismaWith({ game = null, match = null, maxLead = 60 } = {}) {
    return {
      userNotificationSettings: { aggregate: jest.fn().mockResolvedValue({ _max: { gameReminderLeadMinutes: maxLead } }) },
      game: { findFirst: jest.fn().mockResolvedValue(game) },
      tournamentMatch: { findFirst: jest.fn().mockResolvedValue(match) },
    };
  }

  test('nothing upcoming -> null (stay asleep)', async () => {
    expect(await planNextReminderWake({ prisma: prismaWith(), now })).toBeNull();
  });

  test('far game: wakes when its reminder window (max lead) opens', async () => {
    const start = new Date(now.getTime() + 10 * HOUR);
    const at = await planNextReminderWake({ prisma: prismaWith({ game: { start }, maxLead: 120 }), now });
    expect(at).toBe(start.getTime() - 2 * HOUR);
  });

  test('already inside a window -> next sweep after the active cadence', async () => {
    const start = new Date(now.getTime() + 20 * MIN);
    const at = await planNextReminderWake({ prisma: prismaWith({ game: { start } }), now });
    expect(at).toBe(now.getTime() + 5 * MIN);
  });

  test('takes the earlier of the next game and the next tournament match (1h lead)', async () => {
    const game = { start: new Date(now.getTime() + 30 * HOUR) };
    const match = { scheduledAt: new Date(now.getTime() + 4 * HOUR) };
    const at = await planNextReminderWake({ prisma: prismaWith({ game, match }), now });
    expect(at).toBe(now.getTime() + 3 * HOUR);
  });
});
