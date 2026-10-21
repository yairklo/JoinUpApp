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
