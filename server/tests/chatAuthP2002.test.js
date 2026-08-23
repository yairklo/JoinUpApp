/**
 * Unit tests for chatAuth's self-healing ChatParticipant create. checkChatPermission has an
 * outer try/catch that turns ANY thrown error into `return false` (access denied) — so an
 * unguarded P2002 from a concurrent duplicate create silently denies a legitimate user instead
 * of treating "already a participant" as success. Wrapping the create in a P2002-tolerant
 * try/catch (matching the file's other two create() call sites) fixes that.
 */
jest.mock('../lib/prisma', () => ({
  prisma: {
    chatParticipant: { findFirst: jest.fn(), create: jest.fn() },
    participation: { findFirst: jest.fn() },
    game: { findUnique: jest.fn(), findFirst: jest.fn() },
  },
}));

const { prisma } = require('../lib/prisma');
const { checkChatPermission } = require('../utils/chatAuth');

describe('chatAuth self-healing P2002 handling (game participant branch)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('a concurrent duplicate ChatParticipant create (P2002) is treated as success', async () => {
    prisma.chatParticipant.findFirst.mockResolvedValue(null); // not yet recorded as a chat participant
    prisma.participation.findFirst.mockResolvedValue({ id: 'p1', status: 'CONFIRMED' }); // but is a confirmed game participant

    const err = new Error('Unique constraint failed on the fields: (`userId`,`chatId`)');
    err.code = 'P2002';
    prisma.chatParticipant.create.mockRejectedValue(err);

    const result = await checkChatPermission('user1', 'game1');

    expect(result).toBe(true);
    expect(prisma.chatParticipant.create).toHaveBeenCalledWith({
      data: { userId: 'user1', chatId: 'game1' },
    });
  });

  test('a genuine (non-P2002) create failure still denies access rather than crashing', async () => {
    prisma.chatParticipant.findFirst.mockResolvedValue(null);
    prisma.participation.findFirst.mockResolvedValue({ id: 'p1', status: 'CONFIRMED' });

    const err = new Error('Connection lost');
    err.code = 'P1017';
    prisma.chatParticipant.create.mockRejectedValue(err);

    const result = await checkChatPermission('user1', 'game1');

    expect(result).toBe(false);
  });

  test('grants access without a create call when already a recorded participant', async () => {
    prisma.chatParticipant.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await checkChatPermission('user1', 'game1');

    expect(result).toBe(true);
    expect(prisma.chatParticipant.create).not.toHaveBeenCalled();
  });
});
