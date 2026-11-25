// Event-driven driver for the reminder sweeps (game + tournament). It replaces a fixed 5-minute
// setInterval: that tick touched the DB every 5 minutes, which is exactly Neon's autosuspend
// window, so the compute never suspended even with nothing to remind about.
//
// Instead, after every sweep `planNextWake()` (one cheap look at the earliest upcoming game /
// match) says when the next sweep can first matter:
//   - nothing upcoming          -> no timer at all; the DB is left alone until a nudge
//   - first reminder is far off -> sleep until its window opens
//   - inside a window           -> sweep every `activeMs`, as before (users pick their own lead)
// Anything that can create or move a reminder moment calls nudge() (debounced), which re-plans and
// only ever pulls the timer EARLIER, so a stream of nudges can't starve a pending sweep.
const MAX_TIMEOUT = 2_147_000_000; // under Node's 2^31-1 ms setTimeout cap
const MIN_GAP_MS = 60 * 1000;      // never sweep more often than this, whatever the planner says

function createReminderScheduler({
  sweep,                                  // async () => void: runs both reminder sweeps
  planNextWake = null,                    // async (now: Date) => epoch ms | null
  shouldContinue = () => true,            // leader-lock guard, re-checked right before sweeping
  activeMs = 5 * 60 * 1000,
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

  // keepEarlier: a nudge must never push an already-armed, earlier wake further out.
  function arm(at, { keepEarlier = false } = {}) {
    if (!started) return;
    if (at == null) {
      if (!keepEarlier) clearTimer();
      return;
    }
    if (keepEarlier && timer && timerAt <= at) return;
    clearTimer();
    timerAt = at;
    const delay = Math.min(MAX_TIMEOUT, Math.max(0, at - now()));
    timer = setTimeout(() => {
      timer = null;
      timerAt = Infinity;
      if (at - now() > 1000) { arm(at); return; } // clamped long sleep: re-arm the remainder
      run();
    }, delay);
    if (timer.unref) timer.unref();
  }

  async function plan() {
    if (!planNextWake) return now() + activeMs;
    try {
      return await planNextWake(new Date(now()));
    } catch (err) {
      logger.error('[REMINDERS] planning the next wake failed, retrying soon:', err);
      return now() + activeMs;
    }
  }

  async function run() {
    if (!started || sweeping) return;
    if (!shouldContinue()) return;
    sweeping = true;
    try {
      await sweep();
    } catch (err) {
      logger.error('[REMINDERS] sweep failed:', err);
    } finally {
      sweeping = false;
    }
    if (!started) return;
    // Floor: a planner answering "now"/the past must not turn into a back-to-back sweep loop.
    const at = await plan();
    arm(at == null ? null : Math.max(at, now() + MIN_GAP_MS));
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
    /** A game, match or reminder setting changed: re-plan soon (debounced). No-op when stopped. */
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

module.exports = { createReminderScheduler };
