// Cross-process reminder wakes that never reach the leader (Redis publish failed, or the
// subscriber missed it). The non-leader SETs a key. The leader GETs it on a timer and, only
// when it was set, nudges, then DELs. GETDEL is not used: a timeout after the delete was
// applied would drop the only backup. A timed-out GET leaves the key for the next tick.
// This module never opens a database client.
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

/** GET. True only when the key was present. False on a miss OR a Redis error (logged). Never deletes. */
async function peekReminderDirty({ getClient, logger = console } = {}) {
  const client = clientFrom({ getClient, logger });
  if (!client || typeof client.get !== 'function') return false;
  try {
    const val = await withTimeout(client.get(DIRTY_KEY));
    return val != null;
  } catch (err) {
    logger.error('[REMINDERS] dirty flag check failed:', err);
    return false;
  }
}

/**
 * Redis-only poll. `shouldRun` gates each tick (leader only). `onDirty` runs only after a
 * successful GET of a set key — never on an empty key, a timeout, or a Redis error. The key
 * is deleted only after that nudge is accepted and this process is still the leader.
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
    const dirty = await peekReminderDirty({ getClient, logger });
    // Do not delete on a miss, a timeout, or after leadership was lost during the GET.
    // The new leader sweeps on acquire; a key that is still set is its problem.
    if (!dirty || !running()) return;
    try {
      onDirty();
    } catch (err) {
      logger.error('[REMINDERS] dirty flag nudge failed:', err);
      return; // leave the key so the next tick can retry
    }
    if (running()) await clearReminderDirty({ getClient, logger });
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
  peekReminderDirty,
  startReminderDirtyWatch,
};
