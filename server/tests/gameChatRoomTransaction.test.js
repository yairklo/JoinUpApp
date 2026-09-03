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
  // Not exercised by any test in this file — present only because require('../index') below
  // registers every route (including GET routes gated by attachOptionalUser) at module-load
  // time, and Express throws immediately if a wired-in middleware is undefined.
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

const { prisma, createGroupChatForGame } = require('../services/gameService');
const { app } = require('../index');

describe('createGroupChatForGame error propagation (direct, precise)', () => {
  // ChatRoom.id has no DB-level FK to Game — "id === game.id" is an application convention only
  // (see schema.prisma), so a synthetic id is enough here; no Game row needs to exist.
  const chatId = 'txpilot-direct-chatroom-id';

  afterEach(async () => {
    try {
      await prisma.chatParticipant.deleteMany({ where: { chatId } });
      await prisma.chatRoom.deleteMany({ where: { id: chatId } });
    } catch (err) {
      console.warn('createGroupChatForGame direct-test cleanup skipped:', err.message);
    }
  });

  test('a non-existent participant id is a real FK violation (P2003), not swallowed like P2002', async () => {
    // ChatParticipant.userId has a real FK to User.id (schema.prisma) — a non-existent id fails
    // with P2003, which the function's `if (e.code !== 'P2002') throw e;` must let through.
    await expect(
      prisma.$transaction((tx) => createGroupChatForGame(tx, chatId, ['user_txpilot_ghost_nonexistent']))
    ).rejects.toMatchObject({ code: 'P2003' });

    const room = await prisma.chatRoom.findUnique({ where: { id: chatId } });
    expect(room).toBeNull();
  });

  test('a duplicate ChatRoom id (P2002) is swallowed — self-healing, not an error', async () => {
    await prisma.chatRoom.create({ data: { id: chatId, type: 'GROUP' } });

    await expect(
      prisma.$transaction((tx) => createGroupChatForGame(tx, chatId, []))
    ).resolves.toBeUndefined();
  });
});

describe('POST /api/games: the whole creation transaction is atomic, not just Game+ChatRoom on the happy path', () => {
  const organizerId = 'user_txpilot_organizer';
  const testTitle = 'TxPilotRollbackGame';
  let testField;

  beforeAll(async () => {
    await prisma.$connect();
    // Independent writes (different tables, no data dependency) — no reason to serialize them.
    const [, field] = await Promise.all([
      prisma.user.upsert({
        where: { id: organizerId },
        update: { name: 'TxPilotOrganizer' },
        create: { id: organizerId, name: 'TxPilotOrganizer' },
      }),
      prisma.field.create({
        data: { name: 'TxPilotField', location: 'TxPilotField address', type: 'OPEN', available: false },
      }),
    ]);
    testField = field;
  });

  afterAll(async () => {
    try {
      // If the rollback assertion holds there is no game/chatRoom to clean up — this is a
      // best-effort safety net in case the invariant is ever actually broken by a future change.
      const leaked = await prisma.game.findFirst({ where: { title: testTitle } });
      if (leaked) {
        // chatParticipant -> chatRoom has a real FK dependency, must stay ordered. participation
        // and gameRole are both keyed on gameId only, independent of the chat rows and each other.
        await prisma.chatParticipant.deleteMany({ where: { chatId: leaked.id } });
        await Promise.all([
          prisma.chatRoom.deleteMany({ where: { id: leaked.id } }),
          prisma.participation.deleteMany({ where: { gameId: leaked.id } }),
          prisma.gameRole.deleteMany({ where: { gameId: leaked.id } }),
        ]);
        await prisma.game.delete({ where: { id: leaked.id } });
      }
      if (testField) await prisma.field.delete({ where: { id: testField.id } });
    } catch (err) {
      console.warn('gameChatRoomTransaction cleanup skipped:', err.message);
    }
  });

  test('a failure anywhere inside the transaction leaves no partial Game row', async () => {
    // Caveat (confirmed by tracing gameService.js, not assumed): this specific trigger — an
    // invitedParticipantIds entry with no matching User — fails inside tx.game.create()'s own
    // nested `participants: { create: [...] }` write (gameService.js ~885-889), BEFORE
    // createGroupChatForGame (~902) is ever reached. jest.spyOn(prisma.chatRoom, 'create') was
    // tried first and does not work here — Prisma's $transaction callback receives a distinct
    // `tx` client, not the top-level `prisma` object, so the spy never fires (verified: the game
    // was created successfully despite the mock). This test therefore proves the outer
    // prisma.$transaction() genuinely wraps the whole creation flow — a failure anywhere inside
    // it leaves nothing behind — not specifically that a ChatRoom-creation failure does. The
    // `createGroupChatForGame error propagation` tests above cover that function's own contract
    // directly and precisely instead.
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
