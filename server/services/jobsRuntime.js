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
  let reminderTimer = null;
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
    // Tournament + game reminders: every 5 min, plus once now. Each match is claimed in the
    // DB, so a duplicate runner would be a no-op.
    const sweep = () => {
      runTournamentReminders({ io: jobIo, shouldContinue: mayContinue })
        .catch((e) => logger.error('[JOBS] tournament reminder sweep failed:', e));
      runGameReminders({ io: jobIo, shouldContinue: mayContinue })
        .catch((e) => logger.error('[JOBS] game reminder sweep failed:', e));
    };
    reminderTimer = setInterval(sweep, 5 * 60 * 1000);
    sweep();
    // Drain any review backlog left by a crash/redeploy/previous leader.
    gameScheduler.triggerReviewQueue();
    logger.log('🔔 Notification workers started');
  }

  async function stopNow() {
    active = false;
    if (seriesTimer) { clearInterval(seriesTimer); seriesTimer = null; }
    if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
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
