const request = require('supertest');

jest.setTimeout(30000);

const USERS = {
  tok_org: { id: 'fol_org', name: 'Organizer' },
  tok_friend: { id: 'fol_friend', name: 'Friend' },
  tok_stranger: { id: 'fol_stranger', name: 'Stranger' },
  tok_stranger2: { id: 'fol_stranger2', name: 'Stranger 2' },
  tok_member: { id: 'fol_member', name: 'Series member' },
};

jest.mock('../utils/auth', () => {
  const lookup = (req) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    return USERS[token];
  };
  return {
    authenticateToken: (req, res, next) => {
      const user = lookup(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      req.user = { ...user };
      return next();
    },
    attachOptionalUser: (req, res, next) => {
      const user = lookup(req);
      if (user) req.user = { ...user };
      return next();
    },
  };
});

const { prisma } = require('../services/gameService');
const { app } = require('../index');

const ORG = USERS.tok_org.id;
const FRIEND = USERS.tok_friend.id;
const STRANGER = USERS.tok_stranger.id;
const STRANGER2 = USERS.tok_stranger2.id;
const MEMBER = USERS.tok_member.id;
const auth = (tok) => ({ Authorization: `Bearer ${tok}` });

describe('Friends-only games: link policy', () => {
  let field;
  let series;
  const gameIds = [];

  async function makeGame(data = {}) {
    const game = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: ORG,
        start: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        maxPlayers: 10,
        isFriendsOnly: true,
        roles: { create: { userId: ORG, role: 'ORGANIZER' } },
        participants: { create: { userId: ORG, status: 'CONFIRMED' } },
        ...data,
      },
    });
    gameIds.push(game.id);
    return game;
  }

  const participation = (gameId, userId) =>
    prisma.participation.findFirst({ where: { gameId, userId } });

  beforeAll(async () => {
    for (const u of Object.values(USERS)) {
      await prisma.user.upsert({ where: { id: u.id }, update: {}, create: { id: u.id, name: u.name } });
    }
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: ORG }, { userBId: ORG }] } });
    await prisma.friendship.create({ data: { userAId: FRIEND, userBId: ORG } });
    field = await prisma.field.create({
      data: { name: 'מגרש בדיקה friends-only', location: 'רחוב הבדיקות 9', price: 0, available: false, type: 'OPEN' },
    });
    series = await prisma.gameSeries.create({
      data: {
        organizerId: ORG, fieldName: 'x', fieldLocation: 'y', maxPlayers: 10, time: '20:00',
        duration: 1, dayOfWeek: 1, type: 'WEEKLY', isFriendsOnly: true, friendsOnlyLinkPolicy: 'BLOCKED',
      },
    });
    await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: MEMBER, role: 'MEMBER' } });
  });

  afterAll(async () => {
    try {
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: Object.values(USERS).map((u) => u.id) } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.seriesParticipant.deleteMany({ where: { seriesId: series.id } });
      await prisma.gameSeries.delete({ where: { id: series.id } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.friendship.deleteMany({ where: { OR: [{ userAId: ORG }, { userBId: ORG }] } });
    } catch (err) {
      console.warn('friendsOnlyGameLink cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  describe('REQUEST_TO_JOIN (default)', () => {
    let game;
    beforeAll(async () => { game = await makeGame(); });

    test('a stranger can view it, marked as approval-gated', async () => {
      const res = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect(res.body.friendsOnlyLinkPolicy).toBe('REQUEST_TO_JOIN');
      expect(res.body.viewerJoinRequiresApproval).toBe(true);
      expect(res.body.joinPolicy).toBe('REQUIRES_APPROVAL');
    });

    test('an anonymous viewer must sign in first', async () => {
      const res = await request(app).get(`/api/games/${game.id}`);
      expect(res.statusCode).toBe(401);
    });

    test('the organizer sees the real join policy', async () => {
      const res = await request(app).get(`/api/games/${game.id}`).set(auth('tok_org'));
      expect(res.statusCode).toBe(200);
      expect(res.body.viewerJoinRequiresApproval).toBe(false);
      expect(res.body.joinPolicy).toBe('INSTANT');
    });

    test("a stranger's join becomes a pending request", async () => {
      const res = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect(res.body.pending).toBe(true);
      expect((await participation(game.id, STRANGER)).status).toBe('PENDING');
    });

    test('a friend of the organizer joins instantly', async () => {
      const res = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_friend'));
      expect(res.statusCode).toBe(200);
      expect((await participation(game.id, FRIEND)).status).toBe('CONFIRMED');
    });

    test('a rejected outsider cannot re-join instantly', async () => {
      await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_stranger2'));
      expect((await participation(game.id, STRANGER2)).status).toBe('PENDING');
      const rej = await request(app)
        .post(`/api/games/${game.id}/join-requests/${STRANGER2}/reject`).set(auth('tok_org'));
      expect(rej.statusCode).toBe(200);

      const view = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger2'));
      expect(view.statusCode).toBe(200);
      expect(view.body.joinPolicy).toBe('REQUIRES_APPROVAL');

      const again = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_stranger2'));
      expect(again.statusCode).toBe(400);
      expect((await participation(game.id, STRANGER2)).status).toBe('REJECTED');
    });

    test('approving a non-lottery request confirms the player', async () => {
      const res = await request(app)
        .post(`/api/games/${game.id}/join-requests/${STRANGER}/approve`).set(auth('tok_org'));
      expect(res.statusCode).toBe(200);
      expect((await participation(game.id, STRANGER)).status).toBe('CONFIRMED');
    });
  });

  describe('BLOCKED', () => {
    let game;
    beforeAll(async () => {
      game = await makeGame({ friendsOnlyLinkPolicy: 'BLOCKED' });
      await prisma.participation.create({ data: { gameId: game.id, userId: STRANGER2, status: 'PENDING' } });
    });

    test('a stranger cannot view it', async () => {
      const res = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('GAME_FRIENDS_ONLY');
      expect(res.body.participants).toBeUndefined();
    });

    test('an anonymous viewer cannot view it (401)', async () => {
      const res = await request(app).get(`/api/games/${game.id}`);
      expect(res.statusCode).toBe(401);
    });

    test('a stranger cannot join it, and nothing is written', async () => {
      const res = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('GAME_FRIENDS_ONLY');
      expect(await participation(game.id, STRANGER)).toBeNull();
    });

    test('friend and organizer can view it', async () => {
      expect((await request(app).get(`/api/games/${game.id}`).set(auth('tok_friend'))).statusCode).toBe(200);
      expect((await request(app).get(`/api/games/${game.id}`).set(auth('tok_org'))).statusCode).toBe(200);
    });

    test('someone already on the roster can still view it', async () => {
      const res = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger2'));
      expect(res.statusCode).toBe(200);
    });

    test('a friend joins instantly', async () => {
      const res = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_friend'));
      expect(res.statusCode).toBe(200);
      expect((await participation(game.id, FRIEND)).status).toBe('CONFIRMED');
    });

    test('once friendsOnlyUntil has passed, it is public again', async () => {
      const opened = await makeGame({ friendsOnlyLinkPolicy: 'BLOCKED', friendsOnlyUntil: new Date(Date.now() - 60000) });
      expect((await request(app).get(`/api/games/${opened.id}`).set(auth('tok_stranger'))).statusCode).toBe(200);
      const res = await request(app).post(`/api/games/${opened.id}/join`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect((await participation(opened.id, STRANGER)).status).toBe('CONFIRMED');
    });
  });

  describe('lottery games', () => {
    test('an approved outsider enters the lottery instead of taking a seat', async () => {
      const game = await makeGame({ lotteryEnabled: true, lotteryAt: new Date(Date.now() + 24 * 3600 * 1000) });
      const join = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_stranger'));
      expect(join.statusCode).toBe(200);
      expect((await participation(game.id, STRANGER)).status).toBe('PENDING');

      const res = await request(app)
        .post(`/api/games/${game.id}/join-requests/${STRANGER}/approve`).set(auth('tok_org'));
      expect(res.statusCode).toBe(200);
      // Free seats, but the lottery hasn't run: the player goes into the draw.
      expect((await participation(game.id, STRANGER)).status).toBe('WAITLISTED');
    });

    test('a missed draw runs lazily and the outsider can still request (no "window closed")', async () => {
      const game = await makeGame({ lotteryEnabled: true, lotteryAt: new Date(Date.now() - 60000) });
      const res = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect((await prisma.game.findUnique({ where: { id: game.id } })).lotteryExecutedAt).toBeTruthy();
      expect((await participation(game.id, STRANGER)).status).toBe('PENDING');
    });

    test('after the lottery ran, approval confirms when there is room', async () => {
      const game = await makeGame({
        lotteryEnabled: true,
        lotteryAt: new Date(Date.now() - 3600000),
        lotteryExecutedAt: new Date(Date.now() - 3600000),
      });
      await prisma.participation.create({ data: { gameId: game.id, userId: STRANGER, status: 'PENDING' } });
      const res = await request(app)
        .post(`/api/games/${game.id}/join-requests/${STRANGER}/approve`).set(auth('tok_org'));
      expect(res.statusCode).toBe(200);
      expect((await participation(game.id, STRANGER)).status).toBe('CONFIRMED');
    });
  });

  test('a group member can join an existing game of a BLOCKED friends-only group', async () => {
    const game = await makeGame({ seriesId: series.id, friendsOnlyLinkPolicy: 'BLOCKED' });
    expect((await request(app).get(`/api/games/${game.id}`).set(auth('tok_member'))).statusCode).toBe(200);
    const res = await request(app).post(`/api/games/${game.id}/join`).set(auth('tok_member'));
    expect(res.statusCode).toBe(200);
    expect((await participation(game.id, MEMBER)).status).toBe('CONFIRMED');
  });

  test('public games are unaffected', async () => {
    const game = await makeGame({ isFriendsOnly: false, friendsOnlyLinkPolicy: 'BLOCKED' });
    const res = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger'));
    expect(res.statusCode).toBe(200);
    expect(res.body.viewerJoinRequiresApproval).toBe(false);
  });

  test('the organizer can change the policy (PATCH and PUT)', async () => {
    const game = await makeGame();
    const patched = await request(app).patch(`/api/games/${game.id}`).set(auth('tok_org')).send({ friendsOnlyLinkPolicy: 'BLOCKED' });
    expect(patched.statusCode).toBe(200);
    expect(patched.body.friendsOnlyLinkPolicy).toBe('BLOCKED');

    const put = await request(app).put(`/api/games/${game.id}`).set(auth('tok_org')).send({ friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' });
    expect(put.statusCode).toBe(200);
    expect(put.body.friendsOnlyLinkPolicy).toBe('REQUEST_TO_JOIN');

    // Anything but the two values is ignored.
    await request(app).put(`/api/games/${game.id}`).set(auth('tok_org')).send({ friendsOnlyLinkPolicy: 'OPEN' });
    const row = await prisma.game.findUnique({ where: { id: game.id }, select: { friendsOnlyLinkPolicy: true } });
    expect(row.friendsOnlyLinkPolicy).toBe('REQUEST_TO_JOIN');
  });
});
