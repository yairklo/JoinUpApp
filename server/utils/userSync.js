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
    // Never touch name or imageUrl on an existing user here: our DB is the source of truth once the
    // row exists. imageUrl changes only via POST /api/users/:id/image, name only via the profile
    // update endpoint — never silently re-synced from Clerk on unrelated writes (roster join, game create, etc).
    // The only exception (null/empty stored name) is handled race-safely in safeUpsertUserFromAuth.
    update: {},
    create: {
      id,
      name: isNameFallback ? null : name,
      imageUrl: isNameFallback ? null : avatar,
      email: authUser.email ?? undefined,
    },
  };
}

async function safeUpsertUserFromAuth(prisma, authUser) {
  const user = await prisma.user.upsert(buildSafeUserUpsertPayload(authUser));
  const name = authUser.name ?? null;
  if (name && name !== authUser.id && !user.name) {
    // Fill a missing name from Clerk only; the where-guard makes this a no-op if a name was set meanwhile.
    const { count } = await prisma.user.updateMany({
      where: { id: authUser.id, OR: [{ name: null }, { name: '' }] },
      data: { name },
    });
    if (count > 0) return { ...user, name };
  }
  return user;
}

module.exports = { buildSafeUserUpsertPayload, safeUpsertUserFromAuth };
