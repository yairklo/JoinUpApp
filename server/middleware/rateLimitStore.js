const { LRUCache } = require('lru-cache');
const { key: redisKey } = require('../lib/redis');

/**
 * Stores for the HTTP rate limiter. Both expose `hit(key) -> { count, resetAt }` (fixed window
 * counted from the first hit, as the limiter always behaved).
 */

function createMemoryStore({ windowMs }) {
  const hits = new LRUCache({ max: 20000, ttl: windowMs });
  return {
    kind: 'memory',
    hit(key, now = Date.now()) {
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + windowMs };
      entry.count += 1;
      hits.set(key, entry);
      return { count: entry.count, resetAt: entry.resetAt };
    },
  };
}

// INCR + PEXPIRE on first hit, atomically; returns {count, ttlMs}.
const HIT_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {c, ttl}
`;

/**
 * Shared-counter store. Fails OPEN to the per-process memory store (== single-instance
 * behaviour): a Redis error/timeout never blocks a request. After `breakerThreshold` consecutive
 * failures Redis is skipped for `breakerOpenMs` so an outage adds no per-request latency.
 */
function createRedisStore({
  windowMs,
  client,
  timeoutMs = 80,
  breakerThreshold = 3,
  breakerOpenMs = 5000,
  keyPrefix = '',   // namespace inside joinup:rl: (tests use a unique one and clean up by it)
  fallback = createMemoryStore({ windowMs }),
  now = Date.now,
}) {
  let failures = 0;
  let openUntil = 0;

  function withTimeout(p) {
    let t;
    return Promise.race([
      p,
      new Promise((_, reject) => { t = setTimeout(() => reject(new Error('redis timeout')), timeoutMs); }),
    ]).finally(() => clearTimeout(t));
  }

  return {
    kind: 'redis',
    get breakerOpen() { return now() < openUntil; },
    async hit(key) {
      const t = now();
      if (t < openUntil) return fallback.hit(key, t);
      try {
        const res = await withTimeout(client.eval(HIT_LUA, 1, redisKey('rl', ...(keyPrefix ? [keyPrefix] : []), key), String(windowMs)));
        failures = 0;
        const count = Number(res[0]);
        const ttl = Math.max(0, Number(res[1]));
        return { count, resetAt: now() + ttl };
      } catch (err) {
        failures += 1;
        if (failures >= breakerThreshold) openUntil = now() + breakerOpenMs;
        return fallback.hit(key, now());
      }
    },
  };
}

module.exports = { createMemoryStore, createRedisStore, HIT_LUA };
