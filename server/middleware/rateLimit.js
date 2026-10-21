const { createMemoryStore, createRedisStore } = require('./rateLimitStore');
const { getRedis } = require('../lib/redis');

// CF-Connecting-IP is only authoritative when Cloudflare really sits in front of this app: its
// edge overwrites any client-supplied value. Without Cloudflare (production today is a single
// reverse proxy, which `trust proxy` = 1 already resolves into req.ip) the header is plain client
// input, and honoring it lets anyone pick a fresh bucket per request and bypass the limiter.
// Opt in with TRUST_CF_CONNECTING_IP=true only on a deployment proxied by Cloudflare.
function trustCfConnectingIp() {
  const v = process.env.TRUST_CF_CONNECTING_IP;
  return v === 'true' || v === '1';
}

function clientKey(req) {
  const cfIp = trustCfConnectingIp() ? req.headers['cf-connecting-ip'] : undefined;
  const ip = (typeof cfIp === 'string' && cfIp.trim()) || req.ip || req.socket?.remoteAddress || 'unknown';
  return ip.trim() || 'unknown';
}

function isExempt(req) {
  if (req.method === 'OPTIONS') return true;
  const url = String(req.originalUrl || req.url || '');
  return url.startsWith('/api/health')
    || url.startsWith('/api/socket')
    || url.startsWith('/socket.io');
}

// RATE_LIMIT_STORE=redis shares counters across API instances (falls back to memory when
// REDIS_URL is unset, and fails open to memory whenever Redis errors). Default: memory.
function resolveStore({ windowMs }) {
  if (process.env.RATE_LIMIT_STORE === 'redis') {
    const client = getRedis();
    if (client) return createRedisStore({ windowMs, client });
  }
  return createMemoryStore({ windowMs });
}

/**
 * Fixed-window counter per IP. Disabled in Jest unless forceEnable is set.
 * Socket.IO polling and /api/health are never counted.
 * `store` may be injected (tests); otherwise chosen from RATE_LIMIT_STORE on first use.
 */
function createRateLimiter({ windowMs, max, prefix, forceEnable = false, store: injected }) {
  let store = injected || null;
  const disabled = !forceEnable && (process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID);

  return async function rateLimitMiddleware(req, res, next) {
    if (disabled || isExempt(req)) return next();
    try {
      if (!store) store = resolveStore({ windowMs });
      const key = `${prefix}:${clientKey(req)}`;
      const now = Date.now();
      const entry = await store.hit(key);

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

      if (entry.count > max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
        return res.status(429).json({ error: 'Too many requests' });
      }
    } catch (err) {
      // The limiter must never take the API down.
      console.warn('[rateLimit] store error, allowing request:', err && err.message);
    }
    next();
  };
}

function writeMethodLimiter(limiter) {
  return function writeOnlyRateLimit(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    return limiter(req, res, next);
  };
}

// Mirror of writeMethodLimiter, but gates only GET/HEAD (the read/polling traffic:
// feed loads, notification-count polling, chat history fetches, etc). Mutations
// (POST/PUT/PATCH/DELETE) skip this and are gated exclusively by writeMethodLimiter
// below, so the two limiters never double-count the same request.
function readMethodLimiter(limiter) {
  return function readOnlyRateLimit(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    return limiter(req, res, next);
  };
}

module.exports = {
  createRateLimiter,
  writeMethodLimiter,
  readMethodLimiter,
  clientKey,
  isExempt,
};
