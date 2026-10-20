const request = require('supertest');

jest.setTimeout(30000);

const USERS = {
  tok_org: { id: 'fos_org', name: 'Organizer' },
  tok_friend: { id: 'fos_friend', name: 'Friend' },
  tok_stranger: { id: 'fos_stranger', name: 'Stranger' },
  tok_member: { id: 'fos_member', name: 'Member' },
};

jest.mock('../utils/auth', () => {
  const lookup = (req) => USERS[(req.headers['authorization'] || '').split(' ')[1]];
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
const MEMBER = USERS.tok_member.id;
const auth = (tok) => ({ Authorization: `Bearer ${tok}` });

describe('Friends-only series (groups)', () => {
  let field;
  const seriesIds = [];
  const gameIds = [];

  async function makeSeries(data = {}) {
    const s = await prisma.gameSeries.create({
      data: {
        organizerId: ORG, fieldId: field.id, fieldName: 'מגרש', fieldLocation: 'רחוב', maxPlayers: 10,
        time: '20:00', duration: 1, dayOfWeek: 3, type: 'WEEKLY', isFriendsOnly: true, title: 'קבוצת בדיקה',
        ...data,
      },
    });
    seriesIds.push(s.id);
    await prisma.seriesParticipant.create({ data: { seriesId: s.id, userId: MEMBER, role: 'MEMBER' } });
    return s;
  }

  async function makeGame(series, data = {}) {
    const g = await prisma.game.create({
      data: {
        fieldId: field.id, organizerId: ORG, seriesId: series.id, maxPlayers: 10,
        start: new Date(Date.now() + (3 + gameIds.length) * 24 * 3600 * 1000),
        isFriendsOnly: series.isFriendsOnly, friendsOnlyLinkPolicy: series.friendsOnlyLinkPolicy,
        roles: { create: { userId: ORG, role: 'ORGANIZER' } },
        participants: { create: { userId: ORG, status: 'CONFIRMED' } },
        ...data,
      },
    });
    gameIds.push(g.id);
    return g;
  }

  const listIds = async (tok) => {
    const req = request(app).get('/api/series/active');
    const res = tok ? await req.set(auth(tok)) : await req;
    expect(res.statusCode).toBe(200);
    return res.body.map((s) => s.id);
  };

  beforeAll(async () => {
    for (const u of Object.values(USERS)) {
      await prisma.user.upsert({ where: { id: u.id }, update: {}, create: { id: u.id, name: u.name } });
    }
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: ORG }, { userBId: ORG }] } });
    await prisma.friendship.create({ data: { userAId: ORG, userBId: FRIEND } });
    field = await prisma.field.create({
      data: { name: 'מגרש בדיקה קבוצות', location: 'רחוב 1', price: 0, available: false, type: 'OPEN' },
    });
  });

  afterAll(async () => {
    try {
      const userIds = Object.values(USERS).map((u) => u.id);
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.seriesJoinRequest.deleteMany({ where: { seriesId: { in: seriesIds } } });
      await prisma.seriesParticipant.deleteMany({ where: { seriesId: { in: seriesIds } } });
      await prisma.gameSeries.deleteMany({ where: { id: { in: seriesIds } } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.friendship.deleteMany({ where: { OR: [{ userAId: ORG }, { userBId: ORG }] } });
    } catch (err) {
      console.warn('friendsOnlySeries cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  describe('lists and details', () => {
    let blocked;
    let requestable;
    let open;
    beforeAll(async () => {
      blocked = await makeSeries({ friendsOnlyLinkPolicy: 'BLOCKED' });
      requestable = await makeSeries({ friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' });
      open = await makeSeries({ isFriendsOnly: false });
    });

    test('friends-only groups are hidden from outsiders in /active, whatever the link policy', async () => {
      const anon = await listIds();
      const stranger = await listIds('tok_stranger');
      for (const ids of [anon, stranger]) {
        expect(ids).not.toContain(blocked.id);
        expect(ids).not.toContain(requestable.id);
        expect(ids).toContain(open.id);
      }
    });

    test('friends, members and the organizer see them in /active', async () => {
      for (const tok of ['tok_friend', 'tok_member', 'tok_org']) {
        const ids = await listIds(tok);
        expect(ids).toEqual(expect.arrayContaining([blocked.id, requestable.id, open.id]));
      }
    });

    test('BLOCKED: outsiders get 403, insiders get the group', async () => {
      const res = await request(app).get(`/api/series/${blocked.id}`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('SERIES_FRIENDS_ONLY');
      expect((await request(app).get(`/api/series/${blocked.id}`)).statusCode).toBe(403);
      for (const tok of ['tok_friend', 'tok_member', 'tok_org']) {
        const ok = await request(app).get(`/api/series/${blocked.id}`).set(auth(tok));
        expect(ok.statusCode).toBe(200);
        expect(ok.body.viewerAccess).toBe('FULL');
      }
    });

    test('REQUEST_TO_JOIN: outsiders can view it, marked REQUEST', async () => {
      const res = await request(app).get(`/api/series/${requestable.id}`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect(res.body.viewerAccess).toBe('REQUEST');
      expect(res.body.friendsOnlyLinkPolicy).toBe('REQUEST_TO_JOIN');
      expect(res.body.viewerJoinRequestStatus).toBeNull();
      expect(res.body.pendingJoinRequestCount).toBeUndefined();
    });

    test('PATCH changes the policy and propagates it to future games', async () => {
      const s = await makeSeries({ friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' });
      const game = await makeGame(s);
      const res = await request(app).patch(`/api/series/${s.id}`).set(auth('tok_org')).send({ friendsOnlyLinkPolicy: 'BLOCKED' });
      expect(res.statusCode).toBe(200);
      expect(res.body.series.friendsOnlyLinkPolicy).toBe('BLOCKED');
      const g = await prisma.game.findUnique({ where: { id: game.id }, select: { friendsOnlyLinkPolicy: true } });
      expect(g.friendsOnlyLinkPolicy).toBe('BLOCKED');
    });
  });

  describe('join requests', () => {
    let s;
    let existingGame;
    beforeAll(async () => {
      s = await makeSeries({ friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' });
      // Generated before the stranger joins the group.
      existingGame = await makeGame(s);
    });

    const isMember = async (userId) =>
      !!(await prisma.seriesParticipant.findUnique({ where: { seriesId_userId: { seriesId: s.id, userId } } }));

    test('a friend subscribes immediately', async () => {
      const res = await request(app).post(`/api/series/${s.id}/subscribe`).set(auth('tok_friend'));
      expect(res.statusCode).toBe(200);
      expect(res.body.pending).toBeUndefined();
      expect(await isMember(FRIEND)).toBe(true);
    });

    test("an outsider's subscribe becomes a pending request", async () => {
      const res = await request(app).post(`/api/series/${s.id}/subscribe`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect(res.body.pending).toBe(true);
      expect(await isMember(STRANGER)).toBe(false);

      const view = await request(app).get(`/api/series/${s.id}`).set(auth('tok_stranger'));
      expect(view.body.viewerJoinRequestStatus).toBe('PENDING');
      const orgView = await request(app).get(`/api/series/${s.id}`).set(auth('tok_org'));
      expect(orgView.body.pendingJoinRequestCount).toBe(1);
    });

    test('managers list requests; others may not', async () => {
      expect((await request(app).get(`/api/series/${s.id}/join-requests`).set(auth('tok_stranger'))).statusCode).toBe(403);
      const res = await request(app).get(`/api/series/${s.id}/join-requests`).set(auth('tok_org'));
      expect(res.statusCode).toBe(200);
      expect(res.body.pending.map((r) => r.userId)).toEqual([STRANGER]);
    });

    test('a non-manager cannot approve', async () => {
      const res = await request(app).post(`/api/series/${s.id}/join-requests/${STRANGER}/approve`).set(auth('tok_member'));
      expect(res.statusCode).toBe(403);
    });

    test('approval makes them a member, without adding them to any game', async () => {
      const res = await request(app).post(`/api/series/${s.id}/join-requests/${STRANGER}/approve`).set(auth('tok_org'));
      expect(res.statusCode).toBe(200);
      expect(await isMember(STRANGER)).toBe(true);
      expect(await prisma.seriesJoinRequest.findFirst({ where: { seriesId: s.id, userId: STRANGER } })).toBeNull();
      expect(await prisma.participation.findFirst({ where: { gameId: existingGame.id, userId: STRANGER } })).toBeNull();
    });

    test('an approved member can join an already-existing game of the group directly', async () => {
      const res = await request(app).post(`/api/games/${existingGame.id}/join`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(200);
      expect(res.body.pending).toBeUndefined();
      const p = await prisma.participation.findFirst({ where: { gameId: existingGame.id, userId: STRANGER } });
      expect(p.status).toBe('CONFIRMED');
    });

    test('a rejected outsider cannot re-request; cancelling a pending request works', async () => {
      const s2 = await makeSeries({ friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' });
      await request(app).post(`/api/series/${s2.id}/subscribe`).set(auth('tok_stranger'));
      // Cancel (DELETE subscribe) withdraws the pending request.
      await request(app).delete(`/api/series/${s2.id}/subscribe`).set(auth('tok_stranger'));
      expect(await prisma.seriesJoinRequest.findFirst({ where: { seriesId: s2.id, userId: STRANGER } })).toBeNull();

      await request(app).post(`/api/series/${s2.id}/subscribe`).set(auth('tok_stranger'));
      const rej = await request(app).post(`/api/series/${s2.id}/join-requests/${STRANGER}/reject`).set(auth('tok_org'));
      expect(rej.statusCode).toBe(200);
      const again = await request(app).post(`/api/series/${s2.id}/subscribe`).set(auth('tok_stranger'));
      expect(again.statusCode).toBe(400);
      expect(again.body.code).toBe('SERIES_JOIN_DECLINED');
    });

    test('BLOCKED group: outsiders cannot subscribe at all', async () => {
      const s3 = await makeSeries({ friendsOnlyLinkPolicy: 'BLOCKED' });
      const res = await request(app).post(`/api/series/${s3.id}/subscribe`).set(auth('tok_stranger'));
      expect(res.statusCode).toBe(403);
      expect(await prisma.seriesJoinRequest.findFirst({ where: { seriesId: s3.id } })).toBeNull();
    });
  });
});
