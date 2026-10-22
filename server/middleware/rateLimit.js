const { verifyToken } = require('@clerk/backend');
const { createMemoryStore, createRedisStore } = require('./rateLimitStore');
const { getRedis } = require('../lib/redis');

// One verification per token per window. Parallel GETs on a single page would otherwise
// each hit Clerk. Failures are not cached: a bad token stays on the IP bucket.
const verifiedUserIds = new Map();
const USER_ID_CACHE_MS = 60 * 1000;

function bearerToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match ? match[1] : null;
}

function pruneVerifiedUsers(now) {
  for (const [key, entry] of verifiedUserIds) {
    if (entry.until <= now) verifiedUserIds.delete(key);
  }
}

async function verifiedUserId(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const now = Date.now();
  const cached = verifiedUserIds.get(token);
  if (cached) {
    if (cached.until > now) return cached.sub;
    verifiedUserIds.delete(token);
  }
  try {
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const sub = typeof claims?.sub === 'string' && claims.sub ? claims.sub : null;
    if (sub) {
      pruneVerifiedUsers(now);
      verifiedUserIds.set(token, { sub, until: now + USER_ID_CACHE_MS });
    }
    return sub;
  } catch {
    return null;
  }
}

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
    || url.startsWith('/uploads/')
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
 * Fixed-window counter per IP. Pass `resolveUserId` (the read limiter uses
 * `verifiedUserId`) to give a verified Clerk subject its own bucket at `max`;
 * a null id, including a bearer token that does not verify, stays on the IP
 * bucket at `anonymousMax` (default `max`). The default resolver is IP-only,
 * so write and abuse limiters are not split per account.
 * Disabled in Jest unless forceEnable is set. Socket.IO polling and /api/health
 * are never counted. `store` and `resolveUserId` may be injected (tests).
 */
function createRateLimiter({ windowMs, max, anonymousMax, prefix, forceEnable = false, store: injected, resolveUserId }) {
  let store = injected || null;
  const disabled = !forceEnable && (process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID);
  const identify = resolveUserId || (async () => null);
  const guestMax = anonymousMax ?? max;

  return async function rateLimitMiddleware(req, res, next) {
    if (disabled || isExempt(req)) return next();
    try {
      if (!store) store = resolveStore({ windowMs });
      const userId = await identify(req);
      const limit = userId ? max : guestMax;
      const key = `${prefix}:${userId ? `user:${userId}` : `ip:${clientKey(req)}`}`;
      const now = Date.now();
      const entry = await store.hit(key);

      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - entry.count)));

      if (entry.count > limit) {
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
  verifiedUserId,
};
