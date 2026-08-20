/**
 * Safe User upsert — never clobber stored profile when Clerk auth fell back to
 * userId-as-name or null avatar. See server/docs/agents/auth_pitfalls.md.
 */
function buildSafeUserUpsertPayload(authUser) {
  const id = authUser.id;
  const name = authUser.name ?? null;
  const avatar = authUser.avatar ?? authUser.imageUrl ?? null;
  const isNameFallback = !name || name === id;

  return {
    where: { id },
    update: {
      // Never touch imageUrl on an existing user here: once a user has an account, their photo
      // is only changed via the explicit profile-image upload endpoint (POST /api/users/:id/image),
      // never silently re-synced from Clerk's avatar on unrelated writes (roster join, game create, etc).
      name: isNameFallback ? undefined : name,
    },
    create: {
      id,
      name: isNameFallback ? null : name,
      imageUrl: isNameFallback ? null : avatar,
      email: authUser.email ?? undefined,
    },
  };
}

async function safeUpsertUserFromAuth(prisma, authUser) {
  return prisma.user.upsert(buildSafeUserUpsertPayload(authUser));
}

module.exports = { buildSafeUserUpsertPayload, safeUpsertUserFromAuth };
