const request = require('supertest');

jest.setTimeout(30000);

const USERS = {
  tok_org: { id: 'mgj_org', name: 'Organizer' },
  tok_member: { id: 'mgj_member', name: 'Member' },
  tok_friend: { id: 'mgj_friend', name: 'Friend' },
  tok_stranger: { id: 'mgj_stranger', name: 'Stranger' },
  tok_stranger2: { id: 'mgj_stranger2', name: 'Stranger 2' },
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
const MEMBER = USERS.tok_member.id;
const FRIEND = USERS.tok_friend.id;
const STRANGER = USERS.tok_stranger.id;
const STRANGER2 = USERS.tok_stranger2.id;
const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
const HOUR = 3600000;

// Members register from A, guests from B (A <= B). "now" sits between them unless a test moves B.
describe('Members vs guests: /join windows and group approval', () => {
  let field;
  let series;
  const gameIds = [];

  async function makeGame(data = {}) {
    const start = new Date(Date.now() + (3 + gameIds.length) * 24 * HOUR);
    const g = await prisma.game.create({
      data: {
        fieldId: field.id, organizerId: ORG, seriesId: series.id, maxPlayers: 10, start,
        membersOnlyPriority: true,
        registrationOpensAt: new Date(Date.now() - 2 * HOUR),
        guestRegistrationOpensAt: new Date(Date.now() + 2 * HOUR),
        roles: { create: { userId: ORG, role: 'ORGANIZER' } },
        participants: { create: { userId: ORG, status: 'CONFIRMED' } },
        ...data,
      },
    });
    gameIds.push(g.id);
    return g;
  }

  const join = (gameId, tok) => request(app).post(`/api/games/${gameId}/join`).set(auth(tok));

  beforeAll(async () => {
    for (const u of Object.values(USERS)) {
      await prisma.user.upsert({ where: { id: u.id }, update: {}, create: { id: u.id, name: u.name } });
    }
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: ORG }, { userBId: ORG }] } });
    await prisma.friendship.create({ data: { userAId: ORG, userBId: FRIEND } });
    field = await prisma.field.create({
      data: { name: 'מגרש חברים ואורחים', location: 'רחוב 1', price: 0, available: false, type: 'OPEN' },
    });
    series = await prisma.gameSeries.create({
      data: {
        organizerId: ORG, fieldId: field.id, fieldName: 'מגרש', fieldLocation: 'רחוב', maxPlayers: 10,
        time: '20:00', duration: 1, dayOfWeek: 3, type: 'WEEKLY', title: 'קבוצת חברים ואורחים',
        membersOnlyPriority: true, guestRegistrationOpenHours: 24, autoOpenRegistrationHours: 72,
        guestDescription: 'מחיר לאורחים בלבד', guestPrice: 40,
      },
    });
    await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: MEMBER, role: 'MEMBER' } });
  });

  afterAll(async () => {
    try {
      const userIds = Object.values(USERS).map((u) => u.id);
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.message.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.seriesJoinRequest.deleteMany({ where: { seriesId: series.id } });
      await prisma.seriesParticipant.deleteMany({ where: { seriesId: series.id } });
      await prisma.gameSeries.delete({ where: { id: series.id } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.friendship.deleteMany({ where: { OR: [{ userAId: ORG }, { userBId: ORG }] } });
    } catch (err) {
      console.warn('membersGuestsJoin cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  describe('/join while only members may register (A <= now < B)', () => {
    let game;
    beforeAll(async () => { game = await makeGame(); });

    test('a stranger is turned away with GUEST_REGISTRATION_NOT_OPEN', async () => {
      const res = await join(game.id, 'tok_stranger');
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('GUEST_REGISTRATION_NOT_OPEN');
      expect(res.body.guestRegistrationOpensAt).toBe(game.guestRegistrationOpensAt.toISOString());
      expect(await prisma.participation.count({ where: { gameId: game.id, userId: STRANGER } })).toBe(0);
    });

    test("the organizer's friend who is not a member is also a guest", async () => {
      const res = await join(game.id, 'tok_friend');
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('GUEST_REGISTRATION_NOT_OPEN');
    });

    test('a member joins straight away', async () => {
      const res = await join(game.id, 'tok_member');
      expect(res.statusCode).toBe(200);
      const row = await prisma.participation.findFirst({ where: { gameId: game.id, userId: MEMBER } });
      expect(row.status).toBe('CONFIRMED');
    });

    test('the game page tells a guest it is a guest and a member it is not', async () => {
      const asGuest = await request(app).get(`/api/games/${game.id}`).set(auth('tok_stranger'));
      expect(asGuest.statusCode).toBe(200);
      expect(asGuest.body.viewerIsInsider).toBe(false);
      expect(asGuest.body.guestRegistrationOpensAt).toBe(game.guestRegistrationOpensAt.toISOString());
      expect(asGuest.body.guestWelcomeMessage).toBeNull();
      const asMember = await request(app).get(`/api/games/${game.id}`).set(auth('tok_member'));
      expect(asMember.body.viewerIsInsider).toBe(true);
    });
  });

  describe('/join once the guest window is open (now >= B)', () => {
    test('a stranger and a friend can now join', async () => {
      const game = await makeGame({ guestRegistrationOpensAt: new Date(Date.now() - HOUR) });
      expect((await join(game.id, 'tok_stranger')).statusCode).toBe(200);
      expect((await join(game.id, 'tok_friend')).statusCode).toBe(200);
    });
  });

  describe('/join on a game without members-only priority', () => {
    test('a guest window left on the row does not gate anyone', async () => {
      const game = await makeGame({ membersOnlyPriority: false });
      expect((await join(game.id, 'tok_stranger2')).statusCode).toBe(200);
    });
  });

  describe('/join before the members window opens', () => {
    test('members wait too (registrationOpensAt still applies to everyone)', async () => {
      const game = await makeGame({ registrationOpensAt: new Date(Date.now() + HOUR), guestRegistrationOpensAt: new Date(Date.now() + 2 * HOUR) });
      const res = await join(game.id, 'tok_member');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Registration is not yet open');
    });
  });

  describe('joining the group needs approval', () => {
    test('GET /api/series/:id flags the approval requirement for non-members only', async () => {
      const asStranger = await request(app).get(`/api/series/${series.id}`).set(auth('tok_stranger'));
      expect(asStranger.statusCode).toBe(200);
      expect(asStranger.body.viewerJoinRequiresApproval).toBe(true);
      expect(asStranger.body.viewerIsMember).toBe(false);
      expect(asStranger.body.guestDescription).toBe('מחיר לאורחים בלבד');
      expect(asStranger.body.guestPrice).toBe(40);
      expect(asStranger.body.guestWelcomeMessage).toBeUndefined();
      const asMember = await request(app).get(`/api/series/${series.id}`).set(auth('tok_member'));
      expect(asMember.body.viewerJoinRequiresApproval).toBe(false);
      expect(asMember.body.viewerIsMember).toBe(true);
    });

    test("a stranger's and a friend's subscribe become requests, not memberships", async () => {
      for (const [tok, id] of [['tok_stranger', STRANGER], ['tok_friend', FRIEND]]) {
        const res = await request(app).post(`/api/series/${series.id}/subscribe`).set(auth(tok));
        expect(res.statusCode).toBe(200);
        expect(res.body.pending).toBe(true);
        expect(await prisma.seriesParticipant.count({ where: { seriesId: series.id, userId: id } })).toBe(0);
        const reqRow = await prisma.seriesJoinRequest.findUnique({ where: { seriesId_userId: { seriesId: series.id, userId: id } } });
        expect(reqRow.status).toBe('PENDING');
      }
    });

    test('the organizer approves, and the new member gets the members window', async () => {
      const approve = await request(app)
        .post(`/api/series/${series.id}/join-requests/${FRIEND}/approve`).set(auth('tok_org'));
      expect(approve.statusCode).toBe(200);
      expect(await prisma.seriesParticipant.count({ where: { seriesId: series.id, userId: FRIEND } })).toBe(1);
      const game = await makeGame();
      expect((await join(game.id, 'tok_friend')).statusCode).toBe(200);
    });

    test('a non-manager cannot approve', async () => {
      const res = await request(app)
        .post(`/api/series/${series.id}/join-requests/${STRANGER}/approve`).set(auth('tok_member'));
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/series/:id guest window validation', () => {
    test('guests may not open earlier than members', async () => {
      // Members open 72h before; guests 96h before would open first.
      const res = await request(app).patch(`/api/series/${series.id}`).set(auth('tok_org'))
        .send({ guestRegistrationOpenHours: 96, updateFutureGames: false });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('GUEST_WINDOW_BEFORE_MEMBERS');
      const unchanged = await prisma.gameSeries.findUnique({ where: { id: series.id } });
      expect(unchanged.guestRegistrationOpenHours).toBe(24);
    });

    test('a valid change is stored and moves the guest window on future games', async () => {
      const game = await makeGame();
      const res = await request(app).patch(`/api/series/${series.id}`).set(auth('tok_org'))
        .send({ guestRegistrationOpenHours: 12, guestPrice: 55, guestDescription: 'אורחים', updateFutureGames: true });
      expect(res.statusCode).toBe(200);
      const updated = await prisma.game.findUnique({ where: { id: game.id } });
      expect(updated.guestRegistrationOpensAt.getTime()).toBe(updated.start.getTime() - 12 * HOUR);
      expect(updated.guestPrice).toBe(55);
      expect(updated.guestDescription).toBe('אורחים');
    });
  });

  describe('PATCH /api/games/:id per-game override', () => {
    test('rejects a guest time before the members time, accepts one after it', async () => {
      const game = await makeGame();
      const bad = await request(app).patch(`/api/games/${game.id}`).set(auth('tok_org'))
        .send({ guestRegistrationOpensAt: new Date(Date.now() - 5 * HOUR).toISOString() });
      expect(bad.statusCode).toBe(400);
      const ok = await request(app).patch(`/api/games/${game.id}`).set(auth('tok_org'))
        .send({ guestRegistrationOpensAt: new Date(Date.now() + 5 * HOUR).toISOString(), guestPrice: 30 });
      expect(ok.statusCode).toBe(200);
      const row = await prisma.game.findUnique({ where: { id: game.id } });
      expect(row.guestPrice).toBe(30);
    });
  });

  describe('welcome message per audience', () => {
    test('a guest gets the guest message in a private chat, a member gets the normal one', async () => {
      const game = await makeGame({
        guestRegistrationOpensAt: new Date(Date.now() - HOUR),
        welcomeMessage: 'ברוך הבא חבר', guestWelcomeMessage: 'ברוך הבא אורח',
      });
      const flush = () => new Promise((r) => setTimeout(r, 1500));
      await join(game.id, 'tok_stranger2');
      await join(game.id, 'tok_member');
      await flush();
      const texts = async (uid) => (await prisma.message.findMany({ where: { userId: ORG, chatRoom: { participants: { some: { userId: uid } }, type: 'PRIVATE' } } })).map((m) => m.text);
      expect(await texts(STRANGER2)).toContain('ברוך הבא אורח');
      expect(await texts(STRANGER2)).not.toContain('ברוך הבא חבר');
      expect(await texts(MEMBER)).toContain('ברוך הבא חבר');
    });
  });
});
