/**
 * Socket.IO cross-instance adapter (Redis classic pub/sub).
 *
 * Opt-in: SOCKET_ADAPTER=redis AND REDIS_URL. Deliberately NOT gated on Jest so integration
 * tests can enable it; the default Jest env never sets SOCKET_ADAPTER.
 *
 * Fail-open: local delivery always happens first; if Redis is down cross-instance publishes are
 * lost (clients refetch from Postgres on reconnect) and the ioredis clients reconnect forever.
 */
const { createAdapter } = require('@socket.io/redis-adapter');
const { createAdapterClients } = require('../lib/redis');

const DEFAULT_REQUESTS_TIMEOUT_MS = 2000;

function isAdapterRequested(env = process.env) {
  return env.SOCKET_ADAPTER === 'redis';
}

// The adapter fires `pubClient.publish()` without awaiting or catching it. While Redis is down
// every cross-instance emit would become an unhandledRejection (and a Sentry event). Local
// delivery already happened, so swallow the failure and log at most once per 30s.
function guardPublish(pub, logger) {
  if (!pub || typeof pub.publish !== 'function') return;
  let lastLog = 0;
  // publish: fire-and-forget in the adapter. pubsub: used by fetchSockets()/serverCount(); a
  // rejection there is caught by the caller's own fallback, so it is left alone.
  const original = pub.publish.bind(pub);
  pub.publish = (...args) => {
    let res;
    try {
      res = original(...args);
    } catch (err) {
      res = Promise.reject(err);
    }
    return Promise.resolve(res).catch((err) => {
      const t = Date.now();
      if (t - lastLog > 30_000) {
        lastLog = t;
        logger.warn('[socket-adapter] cross-instance publish failed (delivered locally only):', err && err.message);
      }
      return 0;
    });
  };
}

function attachSocketAdapter(io, {
  url = process.env.REDIS_URL,
  enabled = isAdapterRequested(),
  logger = console,
  // Pub/sub channel prefix. Instances that must talk to each other share it (tests isolate runs).
  key = process.env.SOCKET_ADAPTER_KEY || 'joinup-socket',
} = {}) {
  const disabled = { enabled: false, pub: null, sub: null, close: async () => {} };
  if (!enabled) return disabled;
  if (!url) {
    logger.warn('[socket-adapter] SOCKET_ADAPTER=redis but REDIS_URL is not set; using in-memory adapter');
    return disabled;
  }

  let clients;
  try {
    clients = createAdapterClients(url);
    guardPublish(clients.pub, logger);
    io.adapter(createAdapter(clients.pub, clients.sub, {
      key,
      requestsTimeout: DEFAULT_REQUESTS_TIMEOUT_MS,
    }));
  } catch (err) {
    logger.error('[socket-adapter] failed to attach Redis adapter, using in-memory:', err && err.message);
    return disabled;
  }

  return {
    enabled: true,
    pub: clients.pub,
    sub: clients.sub,
    async close() {
      for (const c of [clients.pub, clients.sub]) {
        try { await c.quit(); } catch { try { c.disconnect(); } catch { /* already closed */ } }
      }
    },
  };
}

module.exports = { attachSocketAdapter, isAdapterRequested };
