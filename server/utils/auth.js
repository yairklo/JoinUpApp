const { requireAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');
const { resolveIsAdmin, resolveIsBanned } = require('./admin');

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

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
  baseRequireAuth(req, res, async (err) => {
    if (err) return next(err);
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await clerkClient.users.getUser(userId);
      req.user = mapAuthenticatedUser(userId, user);
    } catch (e) {
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
      const user = await clerkClient.users.getUser(userId);
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
  clerkClient // Exported for use in socket middleware
};
