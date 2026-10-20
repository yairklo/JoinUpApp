/**
 * Idempotency for chat sends: a client retry reuses its tempId, so a retry after a lost echo
 * must not store the message twice. Local Map always (same-instance retries, no Redis round
 * trip); when a Redis client is given (CHAT_DEDUPE_STORE=redis) the claim is also taken with
 * SET NX so a retry that lands on another instance after failover is recognised. Any Redis
 * error falls back to the local Map for that call (fail-open == pre-existing behaviour).
 *
 * Entry states: in flight (echo === null) | stored (echo = payload to re-send to the sender).
 */
const { key: redisKey } = require('../lib/redis');
const { createBreaker } = require('./circuitBreaker');

const TTL_MS = 5 * 60 * 1000;
// The shared in-flight marker must outlive a normal send (the socket handler gives up after 20 s)
// but stay short: if the instance dies mid-send, a retry on another instance must not be ignored
// for the full 5 minutes. Only the stored echo keeps the long TTL.
const INFLIGHT_TTL_MS = 25 * 1000;

function createTempIdDedupe({ client = null, ttlMs = TTL_MS, inflightTtlMs = INFLIGHT_TTL_MS, timeoutMs = 150, breaker = createBreaker() } = {}) {
  const local = new Map(); // key -> { t, echo }
  let lastSweep = 0;

  function sweep(now) {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [k, v] of local) if (now - v.t > ttlMs) local.delete(k);
  }

  function withTimeout(p) {
    let t;
    return Promise.race([
      p,
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), timeoutMs); }),
    ]).finally(() => clearTimeout(t));
  }

  return {
    /** @returns {Promise<{claimed: true} | {claimed: false, echo: object|null}>} */
    async claim(key, now = Date.now()) {
      sweep(now);
      const seen = local.get(key);
      if (seen && now - seen.t <= ttlMs) return { claimed: false, echo: seen.echo };

      if (client && breaker.allow()) {
        try {
          const rk = redisKey('tempid', key);
          const ok = await withTimeout(client.set(rk, '', 'PX', inflightTtlMs, 'NX'));
          if (ok !== 'OK') {
            const v = await withTimeout(client.get(rk));
            breaker.success();
            const echo = v ? JSON.parse(v) : null;
            // Cache locally only a stored echo; an in-flight marker is the other instance's and
            // may expire (crash), after which a retry here must be allowed to claim.
            if (echo) local.set(key, { t: now, echo });
            return { claimed: false, echo };
          }
          breaker.success();
        } catch (_) { breaker.failure(); /* fail open to local */ }
      }
      local.set(key, { t: now, echo: null });
      return { claimed: true };
    },

    async storeEcho(key, echo) {
      local.set(key, { t: Date.now(), echo });
      if (!client || !breaker.allow()) return;
      try {
        await withTimeout(client.set(redisKey('tempid', key), JSON.stringify(echo), 'PX', ttlMs));
        breaker.success();
      } catch (_) { breaker.failure(); /* local copy is enough */ }
    },

    async release(key) {
      local.delete(key);
      if (!client || !breaker.allow()) return;
      try { await withTimeout(client.del(redisKey('tempid', key))); breaker.success(); } catch (_) { breaker.failure(); }
    },
  };
}

module.exports = { createTempIdDedupe, TEMP_ID_TTL_MS: TTL_MS };
