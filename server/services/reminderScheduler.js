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
//  - Any single sleep is capped at MAX_SLEEP_MS and then re-planned, so a missed nudge (a write
//    on a non-leader without Redis) self-heals within that bound.
const MAX_SLEEP_MS = 6 * 60 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

function createReminderScheduler({
  sweep,                                  // async () => void: runs both reminder sweeps
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

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
    timerAt = Infinity;
  }

  // keepEarlier: a re-plan must never push an already-armed, earlier wake further out.
  function arm(at, { keepEarlier = false } = {}) {
    if (!started) return;
    const t = now();
    const target = Math.min(Math.max(at, t + minGapMs), t + maxSleepMs);
    if (keepEarlier && timer && timerAt <= target) return;
    clearTimer();
    timerAt = target;
    timer = setTimeout(() => {
      timer = null;
      timerAt = Infinity;
      run();
    }, target - t);
    if (timer.unref) timer.unref();
  }

  async function plan() {
    if (!planNextWake) return now() + activeMs;
    try {
      const at = await planNextWake(new Date(now()));
      return at == null ? now() + maxSleepMs : at; // nothing upcoming: sleep, then look again
    } catch (err) {
      logger.error('[REMINDERS] planning the next wake failed, retrying soon:', err);
      return now() + activeMs;
    }
  }

  async function run() {
    if (!started || sweeping) return;
    if (!shouldContinue()) {
      // Leadership may only be momentarily unconfirmed (lease renewal). Do not drop the schedule:
      // stop() is what ends it. No DB work here.
      arm(now() + activeMs, { keepEarlier: true });
      return;
    }
    sweeping = true;
    try {
      await sweep();
    } catch (err) {
      logger.error('[REMINDERS] sweep failed:', err);
    } finally {
      sweeping = false;
    }
    if (!started) return;
    // keepEarlier: a nudge handled while plan() was awaiting may already have armed an earlier
    // wake; this (possibly stale) answer must not override it.
    arm(await plan(), { keepEarlier: true });
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
      run();
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

module.exports = { createReminderScheduler, MAX_SLEEP_MS, MIN_GAP_MS };
