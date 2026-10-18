/**
 * Safe User upsert — never clobber stored profile with Clerk data. Our DB is the source of truth
 * once the row exists. See server/docs/agents/auth_pitfalls.md.
 */

// A usable display name is a real name: not the userId fallback, not email-shaped, and not the
// Clerk username/email that displayName() falls back to.
function usableClerkName(authUser) {
  const name = typeof authUser.name === 'string' ? authUser.name.trim() : '';
  if (!name || name === authUser.id || name.includes('@')) return null;
  if (name === authUser.email || name === authUser.username) return null;
  return name;
}

// A stored name that should be replaced if Clerk has a real one (empty, or email-shaped leftovers
// from the old overwrite bug).
function isMissingStoredName(user) {
  const n = user.name;
  return !n || !String(n).trim() || String(n).includes('@') || Boolean(user.email && n === user.email);
}

function buildSafeUserUpsertPayload(authUser) {
  const id = authUser.id;
  const name = usableClerkName(authUser);
  const avatar = authUser.avatar ?? authUser.imageUrl ?? null;
  const isNameFallback = !authUser.name || authUser.name === id;

  return {
    where: { id },
    // Never touch name or imageUrl on an existing user here (photo changes only via
    // POST /api/users/:id/image, name only via the profile update endpoint). The only exception
    // (missing stored name) is handled race-safely in safeUpsertUserFromAuth.
    update: {},
    create: {
      id,
      name,
      imageUrl: isNameFallback ? null : avatar,
      email: authUser.email ?? undefined,
    },
  };
}

async function safeUpsertUserFromAuth(prisma, authUser) {
  const user = await prisma.user.upsert(buildSafeUserUpsertPayload(authUser));
  const name = usableClerkName(authUser);
  // No usable Clerk name or a real stored name -> no extra query.
  if (!name || !isMissingStoredName(user)) return user;

  // Guarded on the exact old value so a concurrent profile edit always wins.
  const { count } = await prisma.user.updateMany({
    where: { id: authUser.id, name: user.name ?? null },
    data: { name },
  });
  return count > 0 ? { ...user, name } : user;
}

module.exports = { buildSafeUserUpsertPayload, safeUpsertUserFromAuth, usableClerkName, isMissingStoredName };
