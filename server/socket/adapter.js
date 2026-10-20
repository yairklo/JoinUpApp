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

function attachSocketAdapter(io, { url = process.env.REDIS_URL, enabled = isAdapterRequested(), logger = console } = {}) {
  const disabled = { enabled: false, pub: null, sub: null, close: async () => {} };
  if (!enabled) return disabled;
  if (!url) {
    logger.warn('[socket-adapter] SOCKET_ADAPTER=redis but REDIS_URL is not set; using in-memory adapter');
    return disabled;
  }

  let clients;
  try {
    clients = createAdapterClients(url);
    io.adapter(createAdapter(clients.pub, clients.sub, {
      key: 'joinup-socket',
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
