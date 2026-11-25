// Event-driven driver for the reminder sweeps (game + tournament). It replaces a fixed 5-minute
// setInterval: that tick touched the DB every 5 minutes, which is exactly Neon's autosuspend
// window, so the compute never suspended even with nothing to remind about.
//
// After every sweep `planNextWake()` says when the next sweep can first have something to send
// (the exact next due moment, see services/reminderWake.js). Anything that can create or move a
// reminder moment calls nudge() (debounced), which re-plans and only ever pulls the timer EARLIER.
//
// Invariants (each has a test):
//  - While started there is ALWAYS a timer armed (or a sweep/plan in flight that will arm one):
//    "nothing upcoming" sleeps MAX_SLEEP_MS, not forever, and a leadership blip (shouldContinue
//    false) re-arms without DB work. Only stop() ends scheduling.
//  - A stale plan can never push out an earlier wake armed by a nudge in the meantime.
//  - Sweeps are never closer than MIN_GAP_MS, whatever the planner answers (no hot loop).
//  - A hung sweep or plan is abandoned after STEP_TIMEOUT_MS, so scheduling can't stall behind it.
//  - If the planner says a reminder is overdue but the sweep sent nothing (a rule the planner
//    can't see, e.g. a tournament gated off for every recipient), back off 5/15/60 min instead of
//    re-sweeping every minute; any sweep that does send, or a normal plan, resets it.
//  - Any single sleep is capped at MAX_SLEEP_MS and then re-planned, so a missed nudge (a write
//    on a non-leader without Redis) self-heals within that bound.
const MAX_SLEEP_MS = 6 * 60 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
const STEP_TIMEOUT_MS = 3 * 60 * 1000;              // a hung sweep/plan must not stall scheduling
const BACKOFF_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];

function createReminderScheduler({
  sweep,                                  // async () => number|void: runs both sweeps, returns #sent
  stepTimeoutMs = STEP_TIMEOUT_MS,
  planNextWake = null,                    // async (now: Date) => epoch ms | null
  shouldContinue = () => true,            // leader-lock guard, re-checked right before sweeping
  activeMs = 5 * 60 * 1000,               // fallback cadence when there is no planner / it fails
  maxSleepMs = MAX_SLEEP_MS,
  minGapMs = MIN_GAP_MS,
  debounceMs = 1000,
  logger = console,
  now = Date.now,
}) {
  let started = false;
  let timer = null;
  let timerAt = Infinity;
  let nudgeTimer = null;
  let sweeping = false;
  let idleStreak = 0; // consecutive overdue-but-nothing-sent sweeps

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
    timerAt = Infinity;
  }

  // keepEarlier: a re-plan must never push an already-armed, earlier wake further out.
  function arm(at, { keepEarlier = false } = {}) {
    if (!started) return;
    const t = now();
    const wanted = Number.isFinite(at) ? at : t + activeMs; // NaN would fire setTimeout in ~1ms
    const target = Math.min(Math.max(wanted, t + minGapMs), t + maxSleepMs);
    if (keepEarlier && timer && timerAt <= target) return;
    clearTimer();
    timerAt = target;
    timer = setTimeout(() => {
      timer = null;
      timerAt = Infinity;
      safeRun();
    }, target - t);
    if (timer.unref) timer.unref();
  }

  function withTimeout(promise, label) {
    let t;
    return Promise.race([
      promise,
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out`)), stepTimeoutMs); }),
    ]).finally(() => clearTimeout(t));
  }

  async function plan() {
    if (!planNextWake) return now() + activeMs;
    try {
      const at = await withTimeout(Promise.resolve(planNextWake(new Date(now()))), 'plan');
      return at == null ? now() + maxSleepMs : at; // nothing upcoming: sleep, then look again
    } catch (err) {
      logger.error('[REMINDERS] planning the next wake failed, retrying soon:', err);
      return now() + activeMs;
    }
  }

  // run() must never reject: it is fired from timers and start().
  function safeRun() {
    run().catch((err) => {
      logger.error('[REMINDERS] run failed:', err);
      arm(now() + activeMs, { keepEarlier: true }); // never leave the scheduler without a timer
    });
  }

  async function run() {
    if (!started || sweeping) return;
    let mayRun = false;
    try { mayRun = !!shouldContinue(); } catch (_) { mayRun = false; }
    if (!mayRun) {
      // Leadership may only be momentarily unconfirmed (lease renewal). Do not drop the schedule:
      // stop() is what ends it. No DB work here.
      arm(now() + activeMs, { keepEarlier: true });
      return;
    }
    sweeping = true;
    let sent;
    try {
      sent = await withTimeout(Promise.resolve(sweep()), 'sweep');
    } catch (err) {
      logger.error('[REMINDERS] sweep failed:', err);
    } finally {
      sweeping = false;
    }
    if (!started) return;
    const at = await plan();
    // Overdue (planner says "already due") yet the sweep sent nothing: the sweep skips something
    // the planner cannot see. Back off rather than re-sweep every minute.
    let target = at;
    if (typeof sent === 'number' && sent === 0 && Number.isFinite(at) && at <= now()) {
      target = now() + BACKOFF_MS[Math.min(idleStreak, BACKOFF_MS.length - 1)];
      idleStreak += 1;
    } else {
      idleStreak = 0;
    }
    // keepEarlier: a nudge handled while plan() was awaiting may already have armed an earlier
    // wake; this (possibly stale) answer must not override it.
    arm(target, { keepEarlier: true });
  }

  async function replan() {
    if (!started || sweeping) return; // a running sweep re-plans itself when it finishes
    arm(await plan(), { keepEarlier: true });
  }

  return {
    /** Sweep once now (boot / leadership gained), then follow the plan. */
    start() {
      if (started) return;
      started = true;
      safeRun();
    },
    stop() {
      started = false;
      clearTimer();
      if (nudgeTimer) clearTimeout(nudgeTimer);
      nudgeTimer = null;
    },
    /** A game, participation, match or reminder setting changed: re-plan soon (debounced). */
    nudge() {
      if (!started || nudgeTimer) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        replan().catch((err) => logger.error('[REMINDERS] replan failed:', err));
      }, debounceMs);
      if (nudgeTimer.unref) nudgeTimer.unref();
    },
    state: () => ({ started, nextWakeAt: timer ? timerAt : null }),
  };
}

module.exports = { createReminderScheduler, MAX_SLEEP_MS, MIN_GAP_MS, BACKOFF_MS, STEP_TIMEOUT_MS };
