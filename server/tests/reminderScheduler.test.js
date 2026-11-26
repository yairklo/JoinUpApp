const {
  createReminderScheduler, MAX_SLEEP_MS, LEADER_LOCK_IDLE_REPLAN_MS, MIN_GAP_MS, BACKOFF_MS, STEP_TIMEOUT_MS,
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
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 10);          // third sweep resolves undefined
    expect(s.state().nextWakeAt - Date.now()).toBeLessThanOrEqual(MIN_GAP_MS);
  });

  test('a thrown sweep with an overdue plan backs off instead of retrying every minute', async () => {
    const sweep = jest.fn().mockRejectedValue(new Error('boom'));
    const planNextWake = jest.fn(async () => Date.now() - 1000);
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt - Date.now()).toBe(BACKOFF_MS[0]);
    await jest.advanceTimersByTimeAsync(10 * MIN);
    expect(sweep.mock.calls.length).toBeLessThanOrEqual(3);
  });

  // Gated match due at T0 (tournamentsPublic off, so the sweep sends nothing); a game starts at
  // T0+60 with a 30-min lead, so its reminder moment is T0+30. Without a future cap the wakes
  // land at ~T0+1, +6, +21, +81 and the game reminder is never armed.
  test('an overdue skipped reminder does not hide a later one due inside the back-off', async () => {
    const T0 = Date.now();
    const matchMoment = T0;
    const gameMoment = T0 + 30 * MIN;
    const sweeps = [];
    const sweep = jest.fn(async () => { sweeps.push(Date.now()); return 0; });
    const planNextWake = jest.fn(async () => {
      const t = Date.now();
      const moments = [matchMoment, gameMoment];
      const future = moments.filter((m) => m > t);
      return {
        at: Math.min(...moments) + SLACK_MS,
        nextFuture: future.length ? Math.min(...future) + SLACK_MS : null,
      };
    });
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(31 * MIN);
    const near = (minute) => sweeps.some((t) => Math.abs(t - (T0 + minute * MIN)) <= 1500);
    expect(near(0)).toBe(true);
    expect(near(1)).toBe(true);
    expect(near(6)).toBe(true);
    expect(near(21)).toBe(true);
    expect(near(30)).toBe(true);
    expect(sweeps).toHaveLength(5);
    s.stop();
  });

  test('a nudge during an overdue sweep clears the escalated back-off for that sweep', async () => {
    let release;
    const sweep = jest.fn()
      .mockResolvedValueOnce(0)
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(0); }));
    const planNextWake = jest.fn(async () => Date.now() - 1000);
    const s = createReminderScheduler({ sweep, planNextWake, debounceMs: 60 * 1000, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);                  // streak 1, next wake +5
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0] + 10); // second sweep is in flight, streak still 1
    s.nudge();                                                // replan is debounced far past this sweep
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(s.state().nextWakeAt - Date.now()).toBe(BACKOFF_MS[0]); // 5 min, not the escalated 15
    s.stop();
  });

  test('a failure at a future-capped wake retries in a minute, not on the escalated rung', async () => {
    const T0 = Date.now();
    const matchMoment = T0 - 30 * MIN; // gated match, already overdue
    const gameMoment = T0 + 25 * MIN;  // start at T0+85 with the default 60-min lead
    const sweeps = [];
    let failedAtCap = false;
    const sweep = jest.fn(async () => {
      const t = Date.now();
      sweeps.push(t);
      if (!failedAtCap && t >= gameMoment) {
        failedAtCap = true;
        throw new Error('boom');
      }
      return 0;
    });
    const planNextWake = jest.fn(async () => {
      const t = Date.now();
      const moments = [matchMoment, gameMoment];
      const future = moments.filter((m) => m > t);
      return {
        at: Math.min(...moments) + SLACK_MS,
        nextFuture: future.length ? Math.min(...future) + SLACK_MS : null,
      };
    });
    const s = createReminderScheduler({ sweep, planNextWake, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(28 * MIN);
    const capped = gameMoment + SLACK_MS;
    const capSweep = sweeps.find((t) => Math.abs(t - capped) <= 1500);
    const retry = sweeps.find((t) => Math.abs(t - (capped + MIN_GAP_MS)) <= 1500);
    expect(capSweep).toEqual(expect.any(Number));
    expect(retry).toEqual(expect.any(Number));
    expect(sweeps.some((t) => t > capped + 2 * MIN && t < capped + 30 * MIN)).toBe(false);
    expect(s.state().nextWakeAt - retry).toBeLessThanOrEqual(BACKOFF_MS[0] + 50);
    expect(s.state().nextWakeAt - retry).toBeGreaterThan(MIN_GAP_MS);
    s.stop();
  });

  test('a write-triggered nudge resets the idle back-off streak', async () => {
    const sweep = jest.fn().mockResolvedValue(0);
    const planNextWake = jest.fn(async () => Date.now() - 1000);
    const s = createReminderScheduler({ sweep, planNextWake, debounceMs: 1000, logger: quiet });
    s.start();
    await jest.advanceTimersByTimeAsync(0);                        // streak 1, wake +5
    await jest.advanceTimersByTimeAsync(BACKOFF_MS[0] + 10);       // streak 2, wake +15
    expect(s.state().nextWakeAt - Date.now()).toBeGreaterThan(BACKOFF_MS[0]);
    s.nudge();
    await jest.advanceTimersByTimeAsync(1500);                     // re-plan pulls the overdue wake in
    await jest.advanceTimersByTimeAsync(MIN_GAP_MS + 10);          // fresh streak: back off 5, not 60
    expect(s.state().nextWakeAt - Date.now()).toBeLessThanOrEqual(BACKOFF_MS[0] + 50);
    s.stop();
  });

  test('idleReplanMs shortens the nothing-upcoming sleep without chopping a known future wake', async () => {
    const idle = createReminderScheduler({
      sweep: jest.fn().mockResolvedValue(undefined),
      planNextWake: jest.fn().mockResolvedValue(null),
      idleReplanMs: LEADER_LOCK_IDLE_REPLAN_MS,
      logger: quiet,
    });
    idle.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(idle.state().nextWakeAt - Date.now()).toBe(LEADER_LOCK_IDLE_REPLAN_MS);
    idle.stop();

    const later = Date.now() + 3 * HOUR;
    const planned = createReminderScheduler({
      sweep: jest.fn().mockResolvedValue(undefined),
      planNextWake: jest.fn().mockResolvedValue(later),
      idleReplanMs: LEADER_LOCK_IDLE_REPLAN_MS,
      logger: quiet,
    });
    planned.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(planned.state().nextWakeAt).toBe(later);
    planned.stop();
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

  test('earliest of the game moment and (match - 1h), which is also still ahead', async () => {
    const game = new Date(now.getTime() + 5 * HOUR);
    const match = new Date(now.getTime() + 4 * HOUR); // reminder at +3h
    const at = now.getTime() + 3 * HOUR + SLACK_MS;
    expect(await planNextReminderWake({ prisma: prismaWith(game, match), now })).toEqual({ at, nextFuture: at });
  });

  test('an already-due moment is reported as past (the scheduler floors / backs off)', async () => {
    const past = new Date(now.getTime() - HOUR);
    expect(await planNextReminderWake({ prisma: prismaWith(past, null), now })).toEqual({
      at: past.getTime() + SLACK_MS,
      nextFuture: null,
    });
  });

  test('a past minimum does not hide a later future column', async () => {
    const past = new Date(now.getTime() - HOUR);
    const future = new Date(now.getTime() + 2 * HOUR);
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ moment: past, future }])
        .mockResolvedValueOnce([{ at: null, futureAt: null }]),
    };
    const w = await planNextReminderWake({ prisma, now });
    expect(w.at).toBe(past.getTime() + SLACK_MS);
    expect(w.nextFuture).toBe(future.getTime() + SLACK_MS);
  });
});