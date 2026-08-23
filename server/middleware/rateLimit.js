const { LRUCache } = require('lru-cache');

function clientKey(req) {
  // req.ip is resolved by Express's `trust proxy` setting, which only trusts
  // the configured number of proxy hops — unlike the raw X-Forwarded-For
  // header, it can't be spoofed by a client to dodge rate limiting.
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return ip.trim() || 'unknown';
}

function isExempt(req) {
  if (req.method === 'OPTIONS') return true;
  const url = String(req.originalUrl || req.url || '');
  return url.startsWith('/api/health')
    || url.startsWith('/api/socket')
    || url.startsWith('/socket.io');
}

/**
 * Fixed-window counter per IP. Disabled in Jest unless forceEnable is set.
 * Socket.IO polling and /api/health are never counted.
 */
function createRateLimiter({ windowMs, max, prefix, forceEnable = false }) {
  const hits = new LRUCache({ max: 20000, ttl: windowMs });
  const disabled = !forceEnable && (process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID);

  return function rateLimitMiddleware(req, res, next) {
    if (disabled || isExempt(req)) return next();

    const key = `${prefix}:${clientKey(req)}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    hits.set(key, entry);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests' });
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

module.exports = {
  createRateLimiter,
  writeMethodLimiter,
  clientKey,
  isExempt,
};
