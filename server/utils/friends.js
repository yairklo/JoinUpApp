/** Ids of everyone `userId` is friends with (Friendship stores each pair once, either order). */
async function getFriendIds(prisma, userId) {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  return rows.map(f => (f.userAId === userId ? f.userBId : f.userAId));
}

module.exports = { getFriendIds };
