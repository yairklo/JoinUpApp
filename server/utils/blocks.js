const crypto = require('crypto');
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
 * Private-chat block between `userId` and the other participant.
 * Group / game chats are never blocked wholesale (a block hides content REST- and client-side).
 * @returns {Promise<null | { otherId: string, senderIsBlocked: boolean }>}
 * `null` when this is not a private pair with a block in either direction.
 * `senderIsBlocked` is true when the other participant has blocked `userId`
 * (the sender is the blocked party), including a mutual block.
 */
async function getPrivateChatBlock(userId, roomId) {
  if (!userId || !roomId) return null;
  const room = await prisma.chatRoom.findUnique({
    where: { id: String(roomId) },
    select: { type: true, participants: { select: { userId: true } } },
  });
  if (!room || room.type !== 'PRIVATE') return null;
  const otherId = room.participants.map((p) => p.userId).find((id) => id !== String(userId));
  if (!otherId) return null;
  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: String(userId), blockedId: String(otherId) },
        { blockerId: String(otherId), blockedId: String(userId) },
      ],
    },
    select: { blockerId: true },
  });
  if (!rows.length) return null;
  const senderIsBlocked = rows.some((r) => r.blockerId === String(otherId));
  return { otherId, senderIsBlocked };
}

/** True when `roomId` is a PRIVATE chat and either side has blocked the other. */
async function isPrivateChatBlocked(userId, roomId) {
  return !!(await getPrivateChatBlock(userId, roomId));
}

/** Prisma cuid() is 25 chars starting with "c". Match that so a stand-in id is not a tell. */
function ephemeralCuid() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(24);
  let id = 'c';
  for (let i = 0; i < 24; i++) id += alphabet[bytes[i] % alphabet.length];
  return id;
}

module.exports = {
  getBlockedEitherWayIds,
  getBlockedByMe,
  isBlockedEitherWay,
  getBlockersAmong,
  getPrivateChatBlock,
  isPrivateChatBlocked,
  ephemeralCuid,
};
