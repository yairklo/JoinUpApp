// Aggregates the lightweight "badge" counters shown on the global Navbar/Tab bar
// (pending friend requests + unread chat messages) and keeps them live via sockets.
// Kept separate from NotificationService (DB-persisted notification feed) since these
// counters are derived/ephemeral — always recomputed from source-of-truth rows.

async function getPendingFriendRequestCount(prisma, userId) {
  return prisma.friendRequest.count({
    where: { receiverId: userId, status: 'PENDING' }
  });
}

async function getUnreadMessageCount(prisma, userId) {
  // Resolve the user's joined room IDs first (indexed lookup on ChatParticipant.userId)
  // rather than filtering Message via a relational `chatRoom: { participants: { some } }`
  // join, which would force a join/scan against the entire Message table as it grows.
  const participations = await prisma.chatParticipant.findMany({
    where: { userId },
    select: { chatId: true }
  });
  const joinedRoomIds = participations.map(p => p.chatId);
  if (joinedRoomIds.length === 0) return 0;

  return prisma.message.count({
    where: {
      chatRoomId: { in: joinedRoomIds },
      userId: { not: userId },
      status: { not: 'read' }
    }
  });
}

async function getCounters(prisma, userId) {
  const [friendRequests, unreadMessages] = await Promise.all([
    getPendingFriendRequestCount(prisma, userId),
    getUnreadMessageCount(prisma, userId)
  ]);
  return { friendRequests, unreadMessages };
}

// Fire-and-forget: recompute this user's counters and push them to their personal
// socket room. Never throws — safe to call without awaiting from any route/handler.
async function broadcastCounters(io, prisma, userId) {
  if (!io || !userId) return;
  try {
    const counters = await getCounters(prisma, userId);
    io.to(`user_${userId}`).emit('countersUpdated', counters);
  } catch (error) {
    console.error('[COUNTERS] Failed to broadcast counters for user', userId, error);
  }
}

module.exports = {
  getPendingFriendRequestCount,
  getUnreadMessageCount,
  getCounters,
  broadcastCounters
};
