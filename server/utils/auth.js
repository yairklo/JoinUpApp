const { requireAuth } = require('@clerk/express');
const { createClerkClient } = require('@clerk/backend');

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
});

// Require auth and map Clerk auth to our expected req.user shape with real name
const baseRequireAuth = requireAuth();
const authenticateToken = (req, res, next) => {
  baseRequireAuth(req, res, async (err) => {
    if (err) return next(err);
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await clerkClient.users.getUser(userId);
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || (user.emailAddresses?.[0]?.emailAddress) || userId;
      const avatar = user.imageUrl || null;
      req.user = { id: userId, name: fullName, avatar, isAdmin: false };
    } catch (e) {
      // Fallback to userId if Clerk fetch fails
      req.user = { id: userId, name: userId, avatar: null, isAdmin: false };
    }
    next();
  });
};

// Optional auth: try to attach req.user if possible, otherwise continue unauthenticated
const attachOptionalUser = (req, res, next) => {
  // Use a dummy response that doesn't terminate the pipeline on 401
  baseRequireAuth(req, res, async (err) => {
    const userId = req.auth?.userId;
    if (err || !userId) {
      return next();
    }
    try {
      const user = await clerkClient.users.getUser(userId);
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || (user.emailAddresses?.[0]?.emailAddress) || userId;
      const avatar = user.imageUrl || null;
      req.user = { id: userId, name: fullName, avatar, isAdmin: false };
    } catch {
      req.user = { id: userId, name: userId, avatar: null, isAdmin: false };
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
  generateToken
};