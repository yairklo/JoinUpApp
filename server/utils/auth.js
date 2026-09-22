const { requireAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');
const { LRUCache } = require('lru-cache');
const { resolveIsAdmin, resolveIsBanned } = require('./admin');

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

// Short-lived per-process cache of Clerk users, so every HTTP request and socket handshake doesn't
// round-trip to Clerk. Stores the in-flight Promise so concurrent lookups for one user share a
// single call; rejected lookups are evicted, never cached. Ban/unban invalidate on this instance;
// on any other instance the TTL bounds how long a stale ban/admin state can last.
const CLERK_USER_TTL_MS = 30_000;
const clerkUserCache = new LRUCache({ max: 5000, ttl: CLERK_USER_TTL_MS });

function getClerkUserCached(userId) {
  const cached = clerkUserCache.get(userId);
  if (cached) return cached;
  const pending = clerkClient.users.getUser(userId);
  clerkUserCache.set(userId, pending);
  pending.catch(() => {
    if (clerkUserCache.get(userId) === pending) clerkUserCache.delete(userId);
  });
  return pending;
}

function invalidateClerkUser(userId) {
  clerkUserCache.delete(userId);
}

function clearClerkUserCache() {
  clerkUserCache.clear();
}

function displayName(user, userId) {
  return [user.firstName, user.lastName].filter(Boolean).join(' ')
    || user.username
    || user.emailAddresses?.[0]?.emailAddress
    || userId;
}

function mapAuthenticatedUser(userId, clerkUser) {
  if (!clerkUser) {
    return { id: userId, name: userId, avatar: null, isAdmin: resolveIsAdmin(userId, null), isBanned: false };
  }
  return {
    id: userId,
    name: displayName(clerkUser, userId),
    avatar: clerkUser.imageUrl || null,
    isAdmin: resolveIsAdmin(userId, clerkUser),
    isBanned: resolveIsBanned(clerkUser),
  };
}

// Require auth and map Clerk auth to our expected req.user shape with real name
const baseRequireAuth = requireAuth();
const authenticateToken = (req, res, next) => {
  // Clerk's requireAuth answers an unauthenticated request with a 302 redirect to the sign-in URL
  // ("/"), which an API client sees as an HTML page. Turn that redirect into a 401 JSON for the
  // duration of the auth check only.
  const originalRedirect = res.redirect;
  res.redirect = () => {
    res.redirect = originalRedirect;
    return res.status(401).json({ error: 'Unauthorized' });
  };
  baseRequireAuth(req, res, async (err) => {
    res.redirect = originalRedirect;
    if (err) return next(err);
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await getClerkUserCached(userId);
      req.user = mapAuthenticatedUser(userId, user);
    } catch (e) {
      console.error(`[auth] clerkClient.users.getUser(${userId}) failed, falling back to ADMIN_USER_IDS-only isAdmin check:`, e.message);
      req.user = mapAuthenticatedUser(userId, null);
    }
    if (req.user.isBanned) {
      return res.status(403).json({ error: 'Account suspended' });
    }
    next();
  });
};

// Optional auth: try to attach req.user if possible, otherwise continue unauthenticated
const attachOptionalUser = (req, res, next) => {
  // If there's no Authorization header, skip auth entirely (public access)
  const hasAuthHeader = typeof req.headers?.authorization === 'string' && req.headers.authorization.trim().length > 0;
  if (!hasAuthHeader) {
    return next();
  }
  // Attempt to authenticate; if it fails, continue as guest
  baseRequireAuth(req, res, async (err) => {
    const userId = req.auth?.userId;
    if (err || !userId) {
      return next();
    }
    try {
      const user = await getClerkUserCached(userId);
      req.user = mapAuthenticatedUser(userId, user);
    } catch {
      req.user = mapAuthenticatedUser(userId, null);
    }
    // Optional-auth routes stay readable for banned accounts, but treat them
    // as guests rather than as their (suspended) identity.
    if (req.user.isBanned) {
      req.user = undefined;
    }
    next();
  });
};

// Helpers for legacy password flow kept as no-ops (not used when Clerk is enabled)
const hashPassword = async () => null;
const comparePassword = async () => false;
const generateToken = () => '';

module.exports = {
  authenticateToken,
  attachOptionalUser,
  hashPassword,
  comparePassword,
  generateToken,
  mapAuthenticatedUser,
  getClerkUserCached,
  invalidateClerkUser,
  clearClerkUserCache,
  clerkClient // Exported for use in socket middleware
};
