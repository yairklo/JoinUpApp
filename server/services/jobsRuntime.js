/**
 * Lifecycle of the in-process background jobs (gameScheduler timers, cleanup cron, weekly series
 * generation, review-queue drain). Extracted from index.js so it can be tested with fakes.
 *
 * Two modes:
 *  - direct (default): this process is the sole job runner; jobs start immediately.
 *  - leader lock (JOBS_LEADER_LOCK=redis): every job-capable process competes for a Redis lock;
 *    jobs run only while this process holds it and stop when it is lost / on shutdown.
 *
 * start()/stop() of the jobs themselves are the only places jobs begin/end in either mode.
 */
const { createReminderScheduler } = require('./reminderScheduler');
const { clearReminderDirty, startReminderDirtyWatch } = require('./reminderDirty');

function createJobsRuntime({
  enabled,                 // RUN_BACKGROUND_JOBS gate (and not Jest)
  httpEnabled,             // this process serves HTTP (false for worker.js)
  useLeaderLock,
  gameScheduler,
  prisma,
  notificationService,
  startCleanupWorker,
  stopCleanupWorker,
  runWeeklySeriesGeneration,
  runTournamentReminders = async () => {},
  runGameReminders = async () => {},
  planReminderWake = null,  // async (now) => ms | { at, nextFuture } | null; null dep = fixed 5-min cadence
  createLeaderLock,
  getRedis,
  adapterEnabled = () => false,
  makeBridgeIo,
  addShutdownHook = () => {},
  ttlMs = 30000,
  logger = console,
}) {
  let active = false;
  let seriesTimer = null;
  let reminderScheduler = null;
  let stopDirtyWatch = null;
  let lock = null;

  const mayContinue = () => active && (!lock || lock.isLeader());

  async function startNow(jobIo) {
    gameScheduler.init({ prisma, io: jobIo, notificationService });
    // Every timer callback / review run re-checks this right before acting (frozen-process guard).
    gameScheduler.setRunGuard(lock ? () => lock.isLeader() : null);
    active = true;
    await gameScheduler.loadAll();
    startCleanupWorker();
    // Weekly series generation: daily, plus once now (non-blocking). Duplicate runs are also
    // absorbed by the Game (seriesId, start) unique constraint.
    seriesTimer = setInterval(
      () => runWeeklySeriesGeneration({ shouldContinue: mayContinue }).catch(() => { }),
      24 * 60 * 60 * 1000,
    );
    runWeeklySeriesGeneration({ shouldContinue: mayContinue }).catch(() => { });
    // Tournament + game reminders: one sweep now, then event-driven (services/reminderScheduler.js)
    // — it sleeps until the next reminder window opens instead of polling the DB every 5 min, so
    // Neon can autosuspend. Each match is claimed in the DB, so a duplicate runner is a no-op.
    // Resolves to how many reminders went out. undefined = a runner reported no count (no back-off).
    // A throw is different: return 0 so an overdue plan backs off instead of sweeping every minute
    // for as long as the failure lasts. Sends on the other runner are already claimed.
    const sweep = async () => {
      let failed = false;
      const [tournament, game] = await Promise.all([
        Promise.resolve(runTournamentReminders({ io: jobIo, shouldContinue: mayContinue }))
          .catch((e) => { logger.error('[JOBS] tournament reminder sweep failed:', e); failed = true; return null; }),
        Promise.resolve(runGameReminders({ io: jobIo, shouldContinue: mayContinue }))
          .catch((e) => { logger.error('[JOBS] game reminder sweep failed:', e); failed = true; return null; }),
      ]);
      if (failed) return 0;
      const t = tournament && typeof tournament.reminded === 'number' ? tournament.reminded : null;
      const g = game && typeof game.sent === 'number' ? game.sent : null;
      return t === null || g === null ? undefined : t + g;
    };
    reminderScheduler = createReminderScheduler({
      sweep, planNextWake: planReminderWake, shouldContinue: mayContinue, logger,
    });
    // Game writes (gameScheduler.resyncGame) and tournament/settings routes nudge through here.
    if (typeof gameScheduler.setReminderNudge === 'function') {
      gameScheduler.setReminderNudge(() => reminderScheduler && reminderScheduler.nudge());
    }
    // A stale dirty flag from before this process became leader is covered by the sweep below.
    // Drop it first so the 60s watch does not immediately plan again. Redis only — no Prisma.
    if (useLeaderLock) {
      await clearReminderDirty({ getClient: getRedis, logger });
    }
    reminderScheduler.start();
    // Lost cross-process wakes (publish failed) set a Redis key. While we lead, GETDEL it every
    // 60s and nudge only if it was set. An empty key does not touch the planner or the DB.
    // Direct mode has no leader and does not run this watch.
    if (useLeaderLock) {
      stopDirtyWatch = startReminderDirtyWatch({
        getClient: getRedis,
        logger,
        shouldRun: mayContinue,
        onDirty: () => { if (reminderScheduler) reminderScheduler.nudge(); },
      });
    }
    // Drain any review backlog left by a crash/redeploy/previous leader.
    gameScheduler.triggerReviewQueue();
    logger.log('🔔 Notification workers started');
  }

  async function stopNow() {
    active = false;
    if (seriesTimer) { clearInterval(seriesTimer); seriesTimer = null; }
    if (stopDirtyWatch) { stopDirtyWatch(); stopDirtyWatch = null; }
    if (reminderScheduler) { reminderScheduler.stop(); reminderScheduler = null; }
    if (typeof gameScheduler.setReminderNudge === 'function') gameScheduler.setReminderNudge(null);
    if (typeof stopCleanupWorker === 'function') stopCleanupWorker();
    gameScheduler.stop();
    logger.log('⏹️  Background jobs stopped');
  }

  return {
    async start(jobIo) {
      if (!enabled) {
        logger.log('⏸️  Background jobs disabled (RUN_BACKGROUND_JOBS=false)');
        return;
      }
      if (!useLeaderLock) {
        addShutdownHook(['jobs', stopNow]);
        await startNow(jobIo);
        return;
      }
      lock = createLeaderLock({
        client: getRedis(),
        ttlMs,
        // A leader on an HTTP instance emits straight into the clustered io when the Redis adapter
        // is on; otherwise (adapter off, or worker.js) it publishes over the bridge so EVERY
        // instance delivers to its own sockets whichever instance happens to be leader.
        onAcquire: () => startNow(httpEnabled && !adapterEnabled() ? makeBridgeIo() : jobIo),
        onLose: stopNow,
      });
      addShutdownHook(['job leader lock', () => lock.stop()]);
      lock.start();
      logger.log(`[JOBS] leader lock enabled (instance ${lock.instanceId}); jobs run only on the lock holder`);
    },
    stop: () => (lock ? lock.stop() : stopNow()),
    state: () => ({
      active,
      mode: !enabled ? 'off' : (lock ? 'leader-lock' : 'direct'),
      lock: lock ? lock.status() : null,
    }),
  };
}

module.exports = { createJobsRuntime };
