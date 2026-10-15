const { prisma } = require('../lib/prisma');

/** Ids of users that `userId` has blocked (their content is hidden from `userId`). */
async function getBlockedByMe(userId) {
  if (!userId) return [];
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: String(userId) },
    select: { blockedId: true },
  });
  return rows.map((r) => r.blockedId);
}

/** Ids of everyone who is blocked by, or has blocked, `userId`. */
async function getBlockedEitherWayIds(userId) {
  if (!userId) return [];
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: String(userId) }, { blockedId: String(userId) }] },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set();
  for (const r of rows) ids.add(r.blockerId === String(userId) ? r.blockedId : r.blockerId);
  return [...ids];
}

/** True when either user has blocked the other. */
async function isBlockedEitherWay(a, b) {
  if (!a || !b) return false;
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: String(a), blockedId: String(b) },
        { blockerId: String(b), blockedId: String(a) },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

/** Subset of `userIds` that have blocked `userId` (they must not be notified by `userId`). */
async function getBlockersAmong(userId, userIds) {
  if (!userId || !userIds || userIds.length === 0) return new Set();
  const rows = await prisma.userBlock.findMany({
    where: { blockedId: String(userId), blockerId: { in: userIds.map(String) } },
    select: { blockerId: true },
  });
  return new Set(rows.map((r) => r.blockerId));
}

/**
 * True when `roomId` is a PRIVATE chat and either side has blocked the other.
 * Group / game chats are never blocked wholesale (a block hides content REST- and client-side).
 */
async function isPrivateChatBlocked(userId, roomId) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: String(roomId) },
    select: { type: true, participants: { select: { userId: true } } },
  });
  if (!room || room.type !== 'PRIVATE') return false;
  const other = room.participants.map((p) => p.userId).find((id) => id !== String(userId));
  if (!other) return false;
  return isBlockedEitherWay(userId, other);
}

module.exports = { getBlockedEitherWayIds, getBlockedByMe, isBlockedEitherWay, getBlockersAmong, isPrivateChatBlocked };
