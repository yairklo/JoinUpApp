const { prisma } = require('../lib/prisma');
const { areConfirmedFriends } = require('./privacy');
const { isBlockedEitherWay } = require('./blocks');

/** True when both users are ChatParticipants of at least one common chat room. */
async function sharesChatWith(viewerId, targetId) {
  const row = await prisma.chatParticipant.findFirst({
    where: { userId: viewerId, chat: { participants: { some: { userId: targetId } } } },
    select: { id: true },
  });
  return !!row;
}

/**
 * True when the viewer may watch the live team-pick session of a game in which the target is one
 * of the picking managers (organizer or captain) — the LiveTeamManagement manager-presence dots.
 * Mirrors canAccessPickSession / getManagerIdsForGame in services/pickSessionService.js.
 */
async function sharesPickSessionWith(viewerId, targetId) {
  const row = await prisma.game.findFirst({
    where: {
      AND: [
        {
          OR: [
            { organizerId: viewerId },
            { roles: { some: { userId: viewerId, role: { in: ['MANAGER', 'CAPTAIN'] } } } },
            { participants: { some: { userId: viewerId, isCaptain: true } } },
          ],
        },
        {
          OR: [
            { organizerId: targetId },
            { participants: { some: { userId: targetId, isCaptain: true } } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

/**
 * Whether `viewerId` may subscribe to `targetId`'s online status. Presence of (possibly minor)
 * users is private: only confirmed friends, users sharing a chat, or co-managers of a pick session
 * may see it — and never across a block in either direction. Fails closed on DB errors.
 */
async function canSubscribePresence(viewerId, targetId) {
  if (!viewerId || !targetId) return false;
  const viewer = String(viewerId);
  const target = String(targetId);
  if (viewer === target) return true;
  try {
    if (await isBlockedEitherWay(viewer, target)) return false;
    if (await areConfirmedFriends(viewer, target)) return true;
    if (await sharesChatWith(viewer, target)) return true;
    return await sharesPickSessionWith(viewer, target);
  } catch (e) {
    console.error('[presenceAuth] permission check failed:', e.message);
    return false;
  }
}

module.exports = { canSubscribePresence };
