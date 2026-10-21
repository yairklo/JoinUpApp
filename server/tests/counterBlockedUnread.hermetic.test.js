// Hermetic: the unread badge ignores messages from people the viewer blocked.
const { getUnreadMessageCount } = require('../services/counterService');

test('unread count excludes messages from blocked users without touching receipts', async () => {
  const prisma = {
    chatParticipant: { findMany: jest.fn(async () => [{ chatId: 'r1' }]) },
    userBlock: { findMany: jest.fn(async () => [{ blockedId: 'bad' }]) },
    message: { groupBy: jest.fn(async () => []), updateMany: jest.fn() },
  };
  await getUnreadMessageCount(prisma, 'me');
  const where = prisma.message.groupBy.mock.calls[0][0].where;
  expect(where.userId).toEqual({ notIn: ['me', 'bad'] });
  expect(prisma.message.updateMany).not.toHaveBeenCalled();
});

test('pending friend-request badge ignores requests from blocked users (either direction)', async () => {
  const { getCounters } = require('../services/counterService');
  const prisma = {
    friendRequest: { count: jest.fn(async () => 0) },
    userBlock: { findMany: jest.fn(async () => [{ blockerId: 'me', blockedId: 'a' }, { blockerId: 'b', blockedId: 'me' }]) },
    chatParticipant: { findMany: jest.fn(async () => []) },
    message: { groupBy: jest.fn(async () => []) },
  };
  await getCounters(prisma, 'me');
  expect(prisma.friendRequest.count.mock.calls[0][0].where.requesterId).toEqual({ notIn: ['a', 'b'] });
});
