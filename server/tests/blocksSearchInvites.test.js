const request = require('supertest');

jest.setTimeout(40000);

jest.mock('../utils/auth', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const users = {
      mock_token_org: { id: 'bsi_org', name: 'bsiorg' },
      mock_token_friend: { id: 'bsi_friend', name: 'bsifriend' },
    };
    if (!users[token]) return res.status(403).json({ error: 'Invalid token' });
    req.user = users[token];
    return next();
  },
  attachOptionalUser: (_req, _res, next) => next(),
  invalidateClerkUser: jest.fn(),
}));

jest.mock('../workers/reviewWorker', () => ({
  processReviewQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn(),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

// Distinct, search-unique display names so queries only match this suite's rows.
const NAME = 'zqxbsi';
const ORG = 'bsi_org';
const BLOCKED = 'bsi_blocked'; // blocked by ORG
const BLOCKER = 'bsi_blocker'; // has blocked ORG
const OK = 'bsi_ok';
const GONE = 'bsi_gone'; // deleted account tombstone
const ids = [ORG, BLOCKED, BLOCKER, OK, GONE, 'bsi_friend'];

let field;
const gameIds = [];

describe('block filtering: search, invites, manual add', () => {
  beforeAll(async () => {
    await prisma.$connect();
    for (const id of ids) {
      await prisma.user.upsert({
        where: { id },
        update: { name: `${NAME} ${id}`, deletedAt: id === GONE ? new Date() : null },
        create: { id, name: `${NAME} ${id}`, deletedAt: id === GONE ? new Date() : null },
      });
    }
    await prisma.userBlock.createMany({
      data: [
        { blockerId: ORG, blockedId: BLOCKED },
        { blockerId: BLOCKER, blockedId: ORG },
      ],
      skipDuplicates: true,
    });
    field = await prisma.field.create({
      data: {
        name: 'bsi field',
        location: 'bsi street',
        city: 'bsi city',
        price: 0,
        rating: 0,
        available: false,
        type: 'OPEN',
      },
    });
  });

  afterAll(async () => {
    try {
      for (const gid of gameIds) {
        await prisma.participation.deleteMany({ where: { gameId: gid } });
        await prisma.gameRole.deleteMany({ where: { gameId: gid } });
        await prisma.team.deleteMany({ where: { gameId: gid } });
        await prisma.chatParticipant.deleteMany({ where: { chatId: gid } });
        await prisma.chatRoom.deleteMany({ where: { id: gid } });
        await prisma.game.deleteMany({ where: { id: gid } });
      }
      await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
      if (field) await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    } catch (err) {
      console.warn('blocksSearchInvites cleanup skipped:', err.message);
    }
  });

  test('GET /api/users/search hides blocked (either way) and deleted users', async () => {
    const res = await request(app)
      .get(`/api/users/search?q=${NAME}`)
      .set('Authorization', 'Bearer mock_token_org');
    expect(res.statusCode).toEqual(200);
    const found = res.body.map((u) => u.id);
    expect(found).toContain(OK);
    expect(found).not.toContain(BLOCKED);
    expect(found).not.toContain(BLOCKER);
    expect(found).not.toContain(GONE);
  });

  test('GET /api/search/global hides blocked (either way) and deleted users', async () => {
    const res = await request(app)
      .get(`/api/search/global?q=${NAME}`)
      .set('Authorization', 'Bearer mock_token_org');
    expect(res.statusCode).toEqual(200);
    const found = res.body.users.map((u) => u.id);
    expect(found).toContain(OK);
    expect(found).not.toContain(BLOCKED);
    expect(found).not.toContain(BLOCKER);
    expect(found).not.toContain(GONE);
  });

  test('game creation skips invited users who are blocked either way', async () => {
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', 'Bearer mock_token_org')
      .send({
        title: 'bsi invite game',
        maxPlayers: 10,
        fieldId: field.id,
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        duration: 1,
        sport: 'SOCCER',
        isOpenToJoin: true,
        joinPolicy: 'INSTANT',
        invitedParticipantIds: [OK, BLOCKED, BLOCKER],
      });
    expect(res.statusCode).toEqual(201);
    gameIds.push(res.body.id);

    const rows = await prisma.participation.findMany({ where: { gameId: res.body.id } });
    const invited = rows.map((r) => r.userId);
    expect(invited).toContain(OK);
    expect(invited).not.toContain(BLOCKED);
    expect(invited).not.toContain(BLOCKER);
  });

  test('organizer cannot manually add a blocked or deleted user', async () => {
    const gameId = gameIds[0];
    expect(gameId).toBeDefined();

    const blocked = await request(app)
      .post(`/api/games/${gameId}/participants`)
      .set('Authorization', 'Bearer mock_token_org')
      .send({ userId: BLOCKED });
    expect(blocked.statusCode).toEqual(403);
    expect(blocked.body.code).toEqual('USER_BLOCKED');

    const blockedMe = await request(app)
      .post(`/api/games/${gameId}/participants`)
      .set('Authorization', 'Bearer mock_token_org')
      .send({ userId: BLOCKER });
    expect(blockedMe.statusCode).toEqual(403);

    const gone = await request(app)
      .post(`/api/games/${gameId}/participants`)
      .set('Authorization', 'Bearer mock_token_org')
      .send({ userId: GONE });
    expect(gone.statusCode).toEqual(404);

    const rows = await prisma.participation.findMany({ where: { gameId, userId: { in: [BLOCKED, BLOCKER, GONE] } } });
    expect(rows).toHaveLength(0);
  });
});
