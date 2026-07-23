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
      name: isNameFallback ? undefined : name,
      imageUrl: (isNameFallback || !avatar) ? undefined : avatar,
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
