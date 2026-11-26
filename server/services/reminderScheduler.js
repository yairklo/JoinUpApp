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
//    false) re-arms without DB work. Only stop() ends scheduling. Both modes use that same idle
//    sleep — a shorter idle re-plan would query the DB all day and keep Neon awake.
//  - A stale plan can never push out an earlier wake armed by a nudge in the meantime.
//  - Sweeps are never closer than MIN_GAP_MS, whatever the planner answers (no hot loop).
//  - A hung sweep or plan is abandoned after STEP_TIMEOUT_MS, so scheduling can't stall behind it.
//  - If the planner says a reminder is overdue but the sweep sent nothing (a rule the planner
//    can't see, e.g. a tournament gated off for every recipient) — or the sweep threw — back off
//    5/15/60 min instead of re-sweeping every minute. That wait is capped by the earliest moment
//    still in the future, so a skipped overdue item cannot hide a different reminder that comes
//    due during the back-off. A wake that was pulled forward for that later moment does not
//    inherit the previous item's rung: if that sweep throws or sends nothing, it retries once
//    at the minimum gap and the ladder starts over at 5 min. A sweep that sends, a normal
//    (not overdue-and-empty) plan, or a write-triggered nudge/re-plan resets the streak.
//  - Any single sleep is capped at MAX_SLEEP_MS and then re-planned, so a missed nudge (Redis
//    down, or direct mode with no Redis) self-heals within that bound. A known future moment is
//    not pulled in. Leader-lock does not poll sooner: a lost cross-process wake is a Redis dirty
//    flag (services/reminderDirty.js), checked with no DB access. A nudge that lands while a
//    sweep is in flight is covered by that sweep's own plan (no second query).
const MAX_SLEEP_MS = 6 * 60 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
const STEP_TIMEOUT_MS = 3 * 60 * 1000;              // a hung sweep/plan must not stall scheduling
const BACKOFF_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];

function createReminderScheduler({
  sweep,                                  // async () => number|void: runs both sweeps, returns #sent
  stepTimeoutMs = STEP_TIMEOUT_MS,
  planNextWake = null,                    // async (now: Date) => epoch ms | { at, nextFuture } | null
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
  let idleStreak = 0; // consecutive overdue-but-nothing-sent (or failed) sweeps
  // The armed timer was shortened to a later reminder, not left on the streak's own rung.
  let armedForFuture = false;

  // A number is the earliest moment only (tests, and any caller that has not grown a future).
  // An object also carries the earliest moment still ahead, which caps an overdue back-off.
  function normalizePlan(raw, t) {
    if (raw == null) return { at: t + maxSleepMs, nextFuture: null };
    if (typeof raw === 'number') return { at: raw, nextFuture: null };
    if (typeof raw === 'object') {
      let at;
      if (typeof raw.at === 'number') at = raw.at;
      else if (raw.at == null) at = t + maxSleepMs;
      else at = t + activeMs;
      const nextFuture = typeof raw.nextFuture === 'number' ? raw.nextFuture : null;
      return { at, nextFuture };
    }
    return { at: t + activeMs, nextFuture: null };
  }

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
    const t = now();
    if (!planNextWake) return { at: t + activeMs, nextFuture: null };
    try {
      const raw = await withTimeout(Promise.resolve(planNextWake(new Date(t))), 'plan');
      // Measure the idle/fallback sleep from when the plan returns, not from when it started.
      return normalizePlan(raw, now());
    } catch (err) {
      logger.error('[REMINDERS] planning the next wake failed, retrying soon:', err);
      return { at: now() + activeMs, nextFuture: null };
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
    let sweepFailed = false;
    try {
      sent = await withTimeout(Promise.resolve(sweep()), 'sweep');
    } catch (err) {
      sweepFailed = true;
      logger.error('[REMINDERS] sweep failed:', err);
    } finally {
      sweeping = false;
    }
    if (!started) return;
    const planned = await plan();
    const at = planned.at;
    const t = now();
    // Overdue (planner says "already due") yet the sweep sent nothing, or the sweep threw:
    // back off rather than re-sweep every minute. Never past the next moment still ahead —
    // otherwise a skipped overdue item hides a different reminder that comes due during the wait.
    let target = at;
    const overdue = Number.isFinite(at) && at <= t;
    const nothingSent = sweepFailed || (typeof sent === 'number' && sent === 0);
    if (nothingSent && overdue && armedForFuture) {
      // This wake was pulled forward for a different reminder. The streak belongs to the
      // overdue item we have been skipping; a miss here must not wait out that 60-min rung
      // (the new reminder's window can close first). One minimum-gap retry, then 5/15/60.
      armedForFuture = false;
      idleStreak = 0;
      target = t + minGapMs;
    } else if (nothingSent && overdue) {
      const backoffAt = t + BACKOFF_MS[Math.min(idleStreak, BACKOFF_MS.length - 1)];
      idleStreak += 1;
      const cap = Number.isFinite(planned.nextFuture) && planned.nextFuture > t ? planned.nextFuture : null;
      if (cap != null && cap < backoffAt) {
        target = cap;
        armedForFuture = true;
      } else {
        target = backoffAt;
        armedForFuture = false;
      }
    } else {
      idleStreak = 0;
      armedForFuture = false;
    }
    // keepEarlier: a nudge handled while plan() was awaiting may already have armed an earlier
    // wake; this (possibly stale) answer must not override it.
    arm(target, { keepEarlier: true });
  }

  async function replan() {
    if (!started || sweeping) return; // a running sweep re-plans itself when it finishes
    idleStreak = 0; // a write changed what is due; don't carry an escalated skip into it
    armedForFuture = false;
    const planned = await plan();
    arm(planned.at, { keepEarlier: true });
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
      if (!started) return;
      // Reset even when a debounce is already pending or a sweep is in flight: the write is new
      // information, and the in-flight sweep's post-plan would otherwise keep the escalated wait.
      idleStreak = 0;
      armedForFuture = false;
      if (nudgeTimer) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        replan().catch((err) => logger.error('[REMINDERS] replan failed:', err));
      }, debounceMs);
      if (nudgeTimer.unref) nudgeTimer.unref();
    },
    state: () => ({ started, nextWakeAt: timer ? timerAt : null }),
  };
}

module.exports = {
  createReminderScheduler, MAX_SLEEP_MS, MIN_GAP_MS, BACKOFF_MS, STEP_TIMEOUT_MS,
};
