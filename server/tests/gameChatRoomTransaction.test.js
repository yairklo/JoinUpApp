const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (token === 'mock_token_txpilot') {
      req.user = { id: 'user_txpilot_organizer', name: 'TxPilotOrganizer', isAdmin: false };
    } else {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn(),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

describe('Game + ChatRoom creation is actually transactional (not just "both exist on success")', () => {
  const organizerId = 'user_txpilot_organizer';
  const testTitle = 'TxPilotRollbackGame';
  let testField;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.upsert({
      where: { id: organizerId },
      update: { name: 'TxPilotOrganizer' },
      create: { id: organizerId, name: 'TxPilotOrganizer' },
    });
    testField = await prisma.field.create({
      data: { name: 'TxPilotField', location: 'TxPilotField address', type: 'OPEN', available: false },
    });
  });

  afterAll(async () => {
    try {
      // If the rollback assertion holds there is no game/chatRoom to clean up — this is a
      // best-effort safety net in case the invariant is ever actually broken by a future change.
      const leaked = await prisma.game.findFirst({ where: { title: testTitle } });
      if (leaked) {
        await prisma.chatParticipant.deleteMany({ where: { chatId: leaked.id } });
        await prisma.chatRoom.deleteMany({ where: { id: leaked.id } });
        await prisma.participation.deleteMany({ where: { gameId: leaked.id } });
        await prisma.gameRole.deleteMany({ where: { gameId: leaked.id } });
        await prisma.game.delete({ where: { id: leaked.id } });
      }
      if (testField) await prisma.field.delete({ where: { id: testField.id } });
    } catch (err) {
      console.warn('gameChatRoomTransaction cleanup skipped:', err.message);
    }
  });

  test('a genuine failure inside the transaction rolls back the already-created Game row', async () => {
    // jest.spyOn(prisma.chatRoom, 'create') does NOT intercept this — Prisma's interactive
    // transaction hands the callback a distinct `tx` client, not the top-level `prisma` object,
    // so spying on the outer client silently misses every write made through `tx`. Force a real
    // failure instead: an invited participant id that doesn't exist in the User table trips a
    // genuine foreign-key violation on the nested Participation/ChatParticipant create — inside
    // the same prisma.$transaction() as the Game row — which is not a P2002, so
    // createGroupChatForGame's catch does not swallow it and the transaction aborts for real.
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', 'Bearer mock_token_txpilot')
      .send({
        title: testTitle,
        maxPlayers: 4,
        fieldId: testField.id,
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration: 1,
        sport: 'SOCCER',
        isOpenToJoin: true,
        joinPolicy: 'INSTANT',
        invitedParticipantIds: ['user_txpilot_ghost_nonexistent'],
      });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);

    const orphanedGame = await prisma.game.findFirst({ where: { title: testTitle } });
    expect(orphanedGame).toBeNull();
  });
});
