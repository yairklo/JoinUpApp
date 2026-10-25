const { resolveIsBanned } = require('./admin');

/**
 * Whether a connected socket's account was suspended or deleted after the handshake.
 * Clerk and deleted-at lookups are cached for a short TTL. A lookup failure fails open,
 * matching handshake auth: a Clerk blip must not drop a socket that already connected.
 *
 * @param {string} userId
 * @param {{ getClerkUserCached?: Function, isAccountDeleted?: Function, resolveIsBanned?: Function }} [deps]
 * @returns {Promise<boolean>}
 */
async function isSocketAccountClosed(userId, deps) {
  if (!userId) return false;
  const resolved = deps || loadDeps();
  const getClerkUserCached = resolved && resolved.getClerkUserCached;
  const isAccountDeleted = resolved && resolved.isAccountDeleted;
  const banned = resolved && resolved.resolveIsBanned ? resolved.resolveIsBanned : resolveIsBanned;
  if (typeof getClerkUserCached !== 'function') return false;
  try {
    const clerkUser = await getClerkUserCached(userId);
    if (banned(clerkUser)) return true;
    if (typeof isAccountDeleted === 'function' && (await isAccountDeleted(userId))) return true;
    return false;
  } catch (e) {
    console.warn('[socket auth] account recheck failed:', e && e.message);
    return false;
  }
}

function loadDeps() {
  const auth = require('./auth');
  return {
    getClerkUserCached: auth.getClerkUserCached,
    isAccountDeleted: auth.isAccountDeleted,
    resolveIsBanned,
  };
}

module.exports = { isSocketAccountClosed };
