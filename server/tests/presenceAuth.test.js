/**
 * Unit tests for socket `subscribePresence` authorization. Before this gate any signed-in socket
 * could watch any user's online status (including minors'). Now only confirmed friends, users
 * sharing a chat, or pick-session co-managers may — never across a block.
 */
jest.mock('../lib/prisma', () => ({
  prisma: {
    friendship: { findUnique: jest.fn() },
    userBlock: { findFirst: jest.fn() },
    chatParticipant: { findFirst: jest.fn() },
    game: { findFirst: jest.fn() },
  },
}));

const { prisma } = require('../lib/prisma');
const { canSubscribePresence } = require('../utils/presenceAuth');

describe('canSubscribePresence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userBlock.findFirst.mockResolvedValue(null);
    prisma.friendship.findUnique.mockResolvedValue(null);
    prisma.chatParticipant.findFirst.mockResolvedValue(null);
    prisma.game.findFirst.mockResolvedValue(null);
  });

  test('denies a stranger with no friendship, shared chat or shared pick session', async () => {
    await expect(canSubscribePresence('viewer', 'target')).resolves.toBe(false);
  });

  test('denies missing ids', async () => {
    await expect(canSubscribePresence(null, 'target')).resolves.toBe(false);
    await expect(canSubscribePresence('viewer', '')).resolves.toBe(false);
  });

  test('allows watching yourself without any DB lookup', async () => {
    await expect(canSubscribePresence('me', 'me')).resolves.toBe(true);
    expect(prisma.userBlock.findFirst).not.toHaveBeenCalled();
  });

  test('allows confirmed friends (ordered pair lookup)', async () => {
    prisma.friendship.findUnique.mockResolvedValue({ userAId: 'a', userBId: 'b' });
    await expect(canSubscribePresence('b', 'a')).resolves.toBe(true);
    expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
      where: { userAId_userBId: { userAId: 'a', userBId: 'b' } },
    });
  });

  test('allows users sharing a chat room', async () => {
    prisma.chatParticipant.findFirst.mockResolvedValue({ id: 'cp1' });
    await expect(canSubscribePresence('viewer', 'target')).resolves.toBe(true);
    expect(prisma.chatParticipant.findFirst).toHaveBeenCalledWith({
      where: { userId: 'viewer', chat: { participants: { some: { userId: 'target' } } } },
      select: { id: true },
    });
  });

  test('allows a pick-session viewer to watch a picking manager of the same game', async () => {
    prisma.game.findFirst.mockResolvedValue({ id: 'g1' });
    await expect(canSubscribePresence('organizer', 'captain')).resolves.toBe(true);
    const where = prisma.game.findFirst.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual([
      { organizerId: 'organizer' },
      { roles: { some: { userId: 'organizer', role: { in: ['MANAGER', 'CAPTAIN'] } } } },
      { participants: { some: { userId: 'organizer', isCaptain: true } } },
    ]);
    expect(where.AND[1].OR).toEqual([
      { organizerId: 'captain' },
      { participants: { some: { userId: 'captain', isCaptain: true } } },
    ]);
  });

  test('a block in either direction wins over friendship and shared chat', async () => {
    prisma.userBlock.findFirst.mockResolvedValue({ id: 'blk' });
    prisma.friendship.findUnique.mockResolvedValue({ userAId: 'target', userBId: 'viewer' });
    prisma.chatParticipant.findFirst.mockResolvedValue({ id: 'cp1' });
    await expect(canSubscribePresence('viewer', 'target')).resolves.toBe(false);
    expect(prisma.userBlock.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: 'viewer', blockedId: 'target' },
          { blockerId: 'target', blockedId: 'viewer' },
        ],
      },
      select: { id: true },
    });
  });

  test('fails closed when the DB check throws', async () => {
    prisma.userBlock.findFirst.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(canSubscribePresence('viewer', 'target')).resolves.toBe(false);
    console.error.mockRestore();
  });
});
