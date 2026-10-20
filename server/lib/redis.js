/**
 * Shared ioredis factory. Never connects at require time and never throws: when REDIS_URL is
 * unset every helper returns null so callers degrade to their in-memory behaviour.
 *
 * Unlike the legacy bridge clients in index.js (which give up after 3 retries), clients made
 * here retry forever with a capped backoff — one Redis blip must not permanently end
 * cross-instance delivery, rate limiting or the job leader lock.
 */
const Redis = require('ioredis');

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'joinup:';

function key(...parts) {
  return KEY_PREFIX + parts.join(':');
}

/** Retry forever; 200ms steps capped at 3s. Never returns null/false. */
function retryStrategy(times) {
  return Math.min(Math.max(1, times) * 200, 3000);
}

const state = { healthy: null, lastError: null };
const errorLog = { at: 0 };

function attachLogging(client, label) {
  client.on('error', (err) => {
    state.lastError = err && err.message;
    state.healthy = false;
    const now = Date.now();
    // Dedupe: a down Redis emits an error per reconnect attempt.
    if (now - errorLog.at > 30_000) {
      errorLog.at = now;
      console.warn(`[redis:${label}] connection error: ${err && err.message}`);
    }
  });
  client.on('ready', () => {
    state.healthy = true;
    state.lastError = null;
  });
  return client;
}

function getUrl() {
  return process.env.REDIS_URL || null;
}

/**
 * New client. opts are merged over the defaults; `failFast` makes commands reject immediately
 * while disconnected (used by hot-path callers such as the rate limiter).
 */
function createClient({ url = getUrl(), label = 'client', failFast = false, ...opts } = {}) {
  if (!url) return null;
  const client = new Redis(url, {
    retryStrategy,
    maxRetriesPerRequest: failFast ? 1 : 3,
    enableOfflineQueue: !failFast,
    connectTimeout: 5000,
    commandTimeout: failFast ? 300 : undefined,
    ...opts,
  });
  return attachLogging(client, label);
}

let shared = null;
/** Process-wide fail-fast command client (limiters, dedupe, leader lock). */
function getRedis() {
  if (!getUrl()) return null;
  if (!shared) shared = createClient({ label: 'shared', failFast: true });
  return shared;
}

/** pub + sub pair for @socket.io/redis-adapter. The adapter manages its own subscriptions. */
function createAdapterClients(url = getUrl()) {
  if (!url) return null;
  const pub = createClient({ url, label: 'adapter-pub' });
  const sub = pub.duplicate();
  attachLogging(sub, 'adapter-sub');
  return { pub, sub };
}

function isRedisHealthy() {
  return state.healthy === true;
}

async function closeSharedRedis() {
  const c = shared;
  shared = null;
  if (!c) return;
  try { await c.quit(); } catch { c.disconnect(); }
}

module.exports = {
  key,
  retryStrategy,
  createClient,
  getRedis,
  createAdapterClients,
  isRedisHealthy,
  closeSharedRedis,
};
