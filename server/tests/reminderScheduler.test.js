const {
  createReminderScheduler, MAX_SLEEP_MS, MIN_GAP_MS, BACKOFF_MS, STEP_TIMEOUT_MS,
} = require('../services/reminderScheduler');
const { SLACK_MS } = require('../services/reminderWake');
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
      .mockResolvedValueOnce(Date.now() + 5 * HOUR)
      .mockResolvedValue(Date.now() + 30 * HOUR);
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(4 * HOUR);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(planNextWake).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(HOUR + 2000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  test('"nothing upcoming" still re-plans after the max sleep (self-heal), never sleeps forever', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const planNextWake = jest.fn().mockResolvedValue(null);
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt).toBe(Date.now() + MAX_SLEEP_MS);
    await jest.advanceTimersByTimeAsync(MAX_SLEEP_MS + 1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(s.state().nextWakeAt).not.toBeNull();
  });

  test('any single sleep is capped at MAX_SLEEP even when the planner answers days ahead', async () => {
    const s = createReminderScheduler({
      sweep: jest.fn().mockResolvedValue(undefined),
      planNextWake: jest.fn().mockResolvedValue(Date.now() + 100 * HOUR),
      logger: quiet,
    });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt - Date.now()).toBeLessThanOrEqual(MAX_SLEEP_MS);
  });

  test('a planner answering "now" cannot cause a back-to-back sweep loop', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, planNextWake: jest.fn(async () => Date.now()), logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep.mock.calls.length).toBeLessThanOrEqual(1 + Math.ceil((10 * MIN) / MIN_GAP_MS));
  });

  test('a nudge pulls the wake earlier but never pushes it later', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const plans = [Date.now() + 5 * HOUR];
    const planNextWake = jest.fn(async () => plans[0]);
    const s = createReminderScheduler({ sweep, planNextWake, debounceMs: 1000, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt).toBe(plans[0]);

    plans[0] = Date.now() + 2 * HOUR; // e.g. someone joined a game that is due sooner
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

  test('blocker A: a stale post-sweep plan cannot override an earlier wake armed by a nudge mid-plan', async () => {
    let releaseSlow;
    const slow = new Promise((resolve) => { releaseSlow = resolve; });
    const t0 = Date.now();
    const planNextWake = jest.fn()
      .mockImplementationOnce(() => slow)                         // run()'s plan, still in flight
      .mockImplementation(async () => t0 + 2 * HOUR);             // the nudge's fresher plan
    const s = createReminderScheduler({
      sweep: jest.fn().mockResolvedValue(undefined), planNextWake, debounceMs: 1000, logger: quiet,
    });
    s.start();
    await jest.advanceTimersByTimeAsync(10);        // sweep done; run() is now awaiting the slow plan
    s.nudge();
    await jest.advanceTimersByTimeAsync(1500);      // nudge replans and arms t0 + 2h
    expect(s.state().nextWakeAt).toBe(t0 + 2 * HOUR);

    releaseSlow(t0 + 5 * HOUR);                      // the stale answer finally lands (later)
    await jest.advanceTimersByTimeAsync(10);
    expect(s.state().nextWakeAt).toBe(t0 + 2 * HOUR);
  });

  test('blocker B: a transient shouldContinue=false re-arms instead of dropping the schedule', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    let leader = true;
    const planNextWake = jest.fn()
      .mockResolvedValueOnce(Date.now() + 2 * HOUR)
      .mockResolvedValue(Date.now() + 40 * HOUR);
    const s = createReminderScheduler({ sweep, planNextWake, shouldContinue: () => leader, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    leader = false;                                  // lease renewal blip right when the timer fires
    await jest.advanceTimersByTimeAsync(2 * HOUR + 1000);
    expect(sweep).toHaveBeenCalledTimes(1);          // no sweep while not leader...
    expect(s.state().nextWakeAt).not.toBeNull();     // ...but the schedule survives (no DB work)
    expect(planNextWake).toHaveBeenCalledTimes(1);

    leader = true;
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep).toHaveBeenCalledTimes(2);          // resumes on its own once leadership is back
  });

  test('blocker B: not leading at start() still leaves a retry timer', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    let leader = false;
    const s = createReminderScheduler({
      sweep, planNextWake: jest.fn().mockResolvedValue(Date.now() + HOUR), shouldContinue: () => leader, logger: quiet,
    });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt).not.toBeNull();
    leader = true;
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test('nudges are debounced into one replan', async () => {
    const planNextWake = jest.fn().mockResolvedValue(Date.now() + 5 * HOUR);
    const s = createReminderScheduler({ sweep: jest.fn().mockResolvedValue(undefined), planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    planNextWake.mockClear();
    s.nudge(); s.nudge(); s.nudge();
    await jest.advanceTimersByTimeAsync(2000);
    expect(planNextWake).toHaveBeenCalledTimes(1);
  });

  test('a nudge during a sweep is covered by the post-sweep plan (no overlapping sweeps)', async () => {
    let release;
    const sweep = jest.fn(() => new Promise((resolve) => { release = resolve; }));
    const planNextWake = jest.fn().mockResolvedValue(Date.now() + 3 * HOUR);
    const s = createReminderScheduler({ sweep, planNextWake, debounceMs: 100, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    s.nudge();
    await jest.advanceTimersByTimeAsync(500);
    expect(planNextWake).not.toHaveBeenCalled();     // replan skipped while sweeping
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(planNextWake).toHaveBeenCalledTimes(1);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test('stop() cancels the pending wake and ignores later nudges', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, planNextWake: jest.fn().mockResolvedValue(Date.now() + HOUR), logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    s.stop();
    s.nudge();
    await jest.advanceTimersByTimeAsync(10 * HOUR);
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

  test('without a planner it falls back to the fixed active cadence', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    const s = createReminderScheduler({ sweep, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(5 * MIN + 1000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });
});

describe('createReminderScheduler - review hardening', () => {
  test('overdue-but-nothing-sent backs off 5/15/60 min instead of sweeping every minute', async () => {
    const sweep = jest.fn().mockResolvedValue(0);                 // e.g. tournament gated off for everyone
    const planNextWake = jest.fn(async () => Date.now() - 1000);  // planner: "already due"
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt - Date.now()).toBe(BACKOFF_MS[0]);
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0] + 10);
    expect(s.state().nextWakeAt - Date.now()).toBeGreaterThan(BACKOFF_MS[0] - 1000);
    expect(s.state().nextWakeAt - Date.now()).toBeLessThanOrEqual(BACKOFF_MS[1]);
    await jest.advanceTimersByTimeAsync(2 * HOUR);
    expect(sweep.mock.calls.length).toBeLessThanOrEqual(6);       // not ~120 one-minute sweeps
  });

  test('a sweep that sends resets the back-off; an unknown result (undefined) never backs off', async () => {
    const sweep = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2).mockResolvedValue(undefined);
    const planNextWake = jest.fn(async () => Date.now() - 1000);
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0] + 10);       // second sweep sent 2 -> reset
    expect(s.state().nextWakeAt - Date.now()).toBeLessThanOrEqual(MIN_GAP_MS);
  });

  test('a hung sweep is abandoned after the step timeout and scheduling continues', async () => {
    const sweep = jest.fn().mockReturnValueOnce(new Promise(() => {})).mockResolvedValue(undefined);
    const planNextWake = jest.fn().mockResolvedValue(Date.now() + 2 * HOUR);
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(STEP_TIMEOUT_MS + 1000);
    expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('sweep failed'), expect.any(Error));
    expect(s.state().nextWakeAt).not.toBeNull();
    s.nudge();                                                    // not stuck behind `sweeping`
    await jest.advanceTimersByTimeAsync(1500);
    expect(planNextWake).toHaveBeenCalledTimes(2);
  });

  test('a hung planner falls back to the active cadence', async () => {
    const planNextWake = jest.fn(() => new Promise(() => {}));
    const s = createReminderScheduler({ sweep: jest.fn().mockResolvedValue(undefined), planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(STEP_TIMEOUT_MS + 1000);
    expect(s.state().nextWakeAt).not.toBeNull();
  });

  test('shouldContinue throwing, or a NaN plan, never kills or hot-loops the schedule', async () => {
    const sweep = jest.fn().mockResolvedValue(undefined);
    let boom = true;
    const s1 = createReminderScheduler({
      sweep, planNextWake: jest.fn().mockResolvedValue(Date.now() + HOUR),
      shouldContinue: () => { if (boom) throw new Error('lease check failed'); return true; }, logger: quiet,
    });
    s1.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s1.state().nextWakeAt).not.toBeNull();
    s1.stop();

    const s2 = createReminderScheduler({ sweep, planNextWake: jest.fn().mockResolvedValue(NaN), logger: quiet });
    sweep.mockClear();
    s2.start();
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

// SQL correctness (and the planner-vs-sweep mirror) is covered against a real Postgres in
// reminderWake.db.test.js; these only check the glue around the two queries.
describe('planNextReminderWake (glue)', () => {
  const now = new Date('2031-03-01T12:00:00Z');
  const prismaWith = (game, match) => ({
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ moment: game }])
      .mockResolvedValueOnce([{ at: match }]),
  });

  test('nothing pending -> null', async () => {
    expect(await planNextReminderWake({ prisma: prismaWith(null, null), now })).toBeNull();
  });

  test('earliest of the game moment and (match - 1h)', async () => {
    const game = new Date(now.getTime() + 5 * HOUR);
    const match = new Date(now.getTime() + 4 * HOUR); // reminder at +3h
    expect(await planNextReminderWake({ prisma: prismaWith(game, match), now })).toBe(now.getTime() + 3 * HOUR + SLACK_MS);
  });

  test('an already-due moment is reported as past (the scheduler floors / backs off)', async () => {
    const past = new Date(now.getTime() - HOUR);
    expect(await planNextReminderWake({ prisma: prismaWith(past, null), now })).toBe(past.getTime() + SLACK_MS);
  });
});