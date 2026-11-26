// Cross-process reminder wakes that never reach the leader (Redis publish failed, or the
// subscriber missed it). The non-leader SETs a key; the leader GETDELs it on a timer and, only
// when it was set, nudges the in-memory scheduler. This module never opens Prisma: an idle
// leader must not touch the DB just to notice that nothing changed.
const redisLib = require('../lib/redis');
const { MAX_SLEEP_MS } = require('./reminderScheduler');

const DIRTY_KEY = redisLib.key('reminders', 'dirty');
const DIRTY_TTL_MS = MAX_SLEEP_MS;          // outlives one max sleep; the 60s check is what matters
const DIRTY_CHECK_MS = 60 * 1000;
const REDIS_OP_TIMEOUT_MS = 2000;

function defaultClient() {
  return redisLib.getRedis();
}

function clientFrom({ getClient, logger = console } = {}) {
  const resolve = typeof getClient === 'function' ? getClient : defaultClient;
  let client;
  try {
    client = resolve();
  } catch (err) {
    logger.error('[REMINDERS] dirty flag redis client failed:', err);
    return null;
  }
  if (!client || typeof client !== 'object') return null;
  return client;
}

// Every Redis command in this path is raced against a short timeout. A late rejection of the
// original command (we already gave up) must not become an unhandled rejection.
function withTimeout(promise) {
  let timer;
  const timed = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('redis timeout')), REDIS_OP_TIMEOUT_MS);
    if (timer.unref) timer.unref();
  });
  const work = Promise.resolve(promise);
  work.catch(() => {});
  return Promise.race([work, timed]).finally(() => clearTimeout(timer));
}

/** Best-effort SET. Never throws. No-op when Redis is not configured. */
function markReminderDirty({ getClient, logger = console } = {}) {
  const client = clientFrom({ getClient, logger });
  if (!client || typeof client.set !== 'function') return;
  let op;
  try {
    op = client.set(DIRTY_KEY, '1', 'PX', DIRTY_TTL_MS);
  } catch (err) {
    logger.error('[REMINDERS] dirty flag set failed:', err);
    return;
  }
  withTimeout(op).catch((err) => {
    logger.error('[REMINDERS] dirty flag set failed:', err);
  });
}

/** DEL. Logs and swallows errors so a Redis blip cannot block the leader from starting. */
async function clearReminderDirty({ getClient, logger = console } = {}) {
  const client = clientFrom({ getClient, logger });
  if (!client || typeof client.del !== 'function') return;
  try {
    await withTimeout(client.del(DIRTY_KEY));
  } catch (err) {
    logger.error('[REMINDERS] clearing dirty flag failed:', err);
  }
}

/** GETDEL. True only when the key was present. False on a miss OR a Redis error (logged). */
async function takeReminderDirty({ getClient, logger = console } = {}) {
  const client = clientFrom({ getClient, logger });
  if (!client || typeof client.getdel !== 'function') return false;
  try {
    const val = await withTimeout(client.getdel(DIRTY_KEY));
    return val != null;
  } catch (err) {
    logger.error('[REMINDERS] dirty flag check failed:', err);
    return false;
  }
}

/**
 * Redis-only poll. `shouldRun` gates each tick (leader only). `onDirty` runs only after a
 * successful GETDEL of a set key — never on an empty key, a timeout, or a Redis error.
 * Returns a stop function. The next tick is scheduled only after the current one settles,
 * one interval later, so a slow Redis cannot pile up or spin.
 */
function startReminderDirtyWatch({
  getClient,
  onDirty,
  shouldRun = () => true,
  logger = console,
  intervalMs = DIRTY_CHECK_MS,
} = {}) {
  let timer = null;
  let stopped = false;

  function running() {
    if (stopped) return false;
    try { return !!shouldRun(); } catch (err) {
      logger.error('[REMINDERS] dirty flag leadership check failed:', err);
      return false;
    }
  }

  async function tick() {
    if (!running()) return;
    const dirty = await takeReminderDirty({ getClient, logger });
    if (!dirty || !running()) return;
    try {
      onDirty();
    } catch (err) {
      logger.error('[REMINDERS] dirty flag nudge failed:', err);
    }
  }

  function arm() {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      tick().finally(() => { if (!stopped) arm(); });
    }, intervalMs);
    if (timer.unref) timer.unref();
  }

  arm();
  return function stopReminderDirtyWatch() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

module.exports = {
  DIRTY_KEY,
  DIRTY_TTL_MS,
  DIRTY_CHECK_MS,
  REDIS_OP_TIMEOUT_MS,
  markReminderDirty,
  clearReminderDirty,
  takeReminderDirty,
  startReminderDirtyWatch,
};
