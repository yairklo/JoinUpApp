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

const TTL_MS = 5 * 60 * 1000;

function createTempIdDedupe({ client = null, ttlMs = TTL_MS, timeoutMs = 150 } = {}) {
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

      if (client) {
        try {
          const rk = redisKey('tempid', key);
          const ok = await withTimeout(client.set(rk, '', 'PX', ttlMs, 'NX'));
          if (ok !== 'OK') {
            const v = await withTimeout(client.get(rk));
            const echo = v ? JSON.parse(v) : null;
            local.set(key, { t: now, echo });
            return { claimed: false, echo };
          }
        } catch (_) { /* fail open to local */ }
      }
      local.set(key, { t: now, echo: null });
      return { claimed: true };
    },

    async storeEcho(key, echo) {
      local.set(key, { t: Date.now(), echo });
      if (!client) return;
      try {
        await withTimeout(client.set(redisKey('tempid', key), JSON.stringify(echo), 'PX', ttlMs));
      } catch (_) { /* local copy is enough */ }
    },

    async release(key) {
      local.delete(key);
      if (!client) return;
      try { await withTimeout(client.del(redisKey('tempid', key))); } catch (_) { /* ignore */ }
    },
  };
}

module.exports = { createTempIdDedupe, TEMP_ID_TTL_MS: TTL_MS };
