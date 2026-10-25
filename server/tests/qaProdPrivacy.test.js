const request = require('supertest');

jest.setTimeout(30000);

jest.mock('../utils/auth', () => {
  const lookup = (req) => USERS_BY_TOKEN[(req.headers['authorization'] || '').split(' ')[1]];
  const USERS_BY_TOKEN = {
    qp_adult: { id: 'qp_adult', name: 'Adult QA' },
    qp_minor: { id: 'qp_minor', name: 'Minor QA' },
    qp_stranger: { id: 'qp_stranger', name: 'Stranger QA' },
    qp_g_org: { id: 'qp_g_org', name: 'Org QA' },
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

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn(), runCleanup: jest.fn() }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));

const { prisma } = require('../services/gameService');
const { app } = require('../index');
const { getUnreadMessageCount } = require('../services/counterService');
const { scrub } = require('../middleware/scrubEmailNames');

const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000);
const EMAIL = 'qp_email_name@example.com';

describe('Q-01: blocked private messages never reach a minor', () => {
  const roomId = `qp_room_${Date.now()}`;

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: 'qp_adult' }, update: { birthDate: yearsAgo(30) }, create: { id: 'qp_adult', name: 'Adult QA', birthDate: yearsAgo(30) } });
    await prisma.user.upsert({ where: { id: 'qp_minor' }, update: { birthDate: yearsAgo(15) }, create: { id: 'qp_minor', name: 'Minor QA', birthDate: yearsAgo(15) } });
    await prisma.chatRoom.create({
      data: { id: roomId, type: 'PRIVATE', participants: { create: [{ userId: 'qp_adult' }, { userId: 'qp_minor' }] } },
    });
  });

  afterAll(async () => {
    await prisma.flaggedMessage.deleteMany({ where: { userId: 'qp_adult' } }).catch(() => {});
    await prisma.message.deleteMany({ where: { chatRoomId: roomId } }).catch(() => {});
    await prisma.chatParticipant.deleteMany({ where: { chatId: roomId } }).catch(() => {});
    await prisma.chatRoom.deleteMany({ where: { id: roomId } }).catch(() => {});
  });

  test('the slurs are blocked for the sender', async () => {
    for (const text of ['זונה', 'שרמוטה']) {
      const res = await request(app).post('/api/messages').set(auth('qp_adult')).send({ roomId, text });
      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('blocked');
    }
    const ok = await request(app).post('/api/messages').set(auth('qp_adult')).send({ roomId, text: 'מגיע למשחק מחר?' });
    expect(ok.body.status).not.toBe('blocked');
  });

  test('the minor never sees them in history, even after the unread state changes', async () => {
    // The old socket markAsRead promoted every non-read message (including blocked ones) to
    // "read", which made them pass the history filter. It now leaves blocked rows alone.
    await prisma.message.updateMany({
      where: { chatRoomId: roomId, userId: { not: 'qp_minor' }, status: { notIn: ['read', 'blocked'] } },
      data: { status: 'read' },
    });

    const res = await request(app).get('/api/messages').query({ roomId }).set(auth('qp_minor'));
    expect(res.statusCode).toBe(200);
    const texts = res.body.map((m) => m.text);
    expect(texts).toContain('מגיע למשחק מחר?');
    expect(texts).not.toContain('זונה');
    expect(texts).not.toContain('שרמוטה');

    // The sender still sees their own blocked bubbles.
    const own = await request(app).get('/api/messages').query({ roomId }).set(auth('qp_adult'));
    expect(own.body.map((m) => m.text)).toEqual(expect.arrayContaining(['זונה', 'שרמוטה']));
  });

  test('a blocked message is not quoted back through replyTo', async () => {
    await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
    const blocked = await request(app).post('/api/messages').set(auth('qp_adult')).send({ roomId, text: 'זונה' });
    expect(blocked.body.status).toBe('blocked');
    const clean = await prisma.message.create({
      data: { chatRoomId: roomId, userId: 'qp_adult', text: 'היי', status: 'sent', replyToId: blocked.body.id },
    });

    const asMinor = await request(app).get('/api/messages').query({ roomId }).set(auth('qp_minor'));
    const row = asMinor.body.find((m) => m.id === clean.id);
    expect(row).toBeTruthy();
    expect(row.replyTo).toBeUndefined();
    expect(JSON.stringify(asMinor.body)).not.toContain('זונה');

    const asAuthor = await request(app).get('/api/messages').query({ roomId }).set(auth('qp_adult'));
    expect(asAuthor.body.find((m) => m.id === clean.id).replyTo.text).toBe('זונה');
  });

  test('the one-off script puts already-exposed blocked messages back to blocked', async () => {
    const { restoreBlockedMessages } = require('../scripts/restoreBlockedMessages');
    await prisma.message.deleteMany({ where: { chatRoomId: roomId } });
    await prisma.flaggedMessage.deleteMany({ where: { userId: 'qp_adult' } });
    const exposed = await prisma.message.create({ data: { chatRoomId: roomId, userId: 'qp_adult', text: 'שרמוטה', status: 'read' } });
    const harmless = await prisma.message.create({ data: { chatRoomId: roomId, userId: 'qp_adult', text: 'שלום', status: 'read' } });
    await prisma.flaggedMessage.create({
      data: {
        content: 'שרמוטה', userId: 'qp_adult', status: 'PENDING_REVIEW',
        aiTriggers: { source: 'blocked_attempt', reason: 'severe_slur', roomId },
      },
    });

    const dry = await restoreBlockedMessages(prisma);
    expect(dry.ids).toContain(exposed.id);
    expect(dry.ids).not.toContain(harmless.id);
    expect((await prisma.message.findUnique({ where: { id: exposed.id } })).status).toBe('read');

    const applied = await restoreBlockedMessages(prisma, { apply: true });
    expect(applied.restored).toBeGreaterThanOrEqual(1);
    expect((await prisma.message.findUnique({ where: { id: exposed.id } })).status).toBe('blocked');
    expect((await prisma.message.findUnique({ where: { id: harmless.id } })).status).toBe('read');

    const history = await request(app).get('/api/messages').query({ roomId }).set(auth('qp_minor'));
    expect(history.body.map((m) => m.text)).toEqual(['שלום']);
    expect((await restoreBlockedMessages(prisma, { apply: true })).restored).toBe(0);
  });

  test('blocked messages are not counted as unread and not shown as the last message', async () => {
    await prisma.message.updateMany({ where: { chatRoomId: roomId, status: 'read' }, data: { status: 'sent' } });
    await prisma.message.deleteMany({ where: { chatRoomId: roomId, status: { not: 'blocked' } } });
    expect(await getUnreadMessageCount(prisma, 'qp_minor')).toBe(0);

    const chats = await request(app).get('/api/users/qp_minor/chats').set(auth('qp_minor'));
    const chat = chats.body.find((c) => c.id === roomId);
    expect(chat.unreadCount).toBe(0);
    expect(chat.lastMessage).toBeNull();
  });
});

describe('Q-02: friends-only game details for logged-out and outsider viewers', () => {
  let field;
  let game;
  let publicGame;
  const ids = ['qp_g_org', 'qp_g_minor', 'qp_g_emailer'];

  async function makeGame(extra = {}) {
    return prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: 'qp_g_org',
        start: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        maxPlayers: 10,
        roles: { create: { userId: 'qp_g_org', role: 'ORGANIZER' } },
        participants: {
          create: [
            { userId: 'qp_g_org', status: 'CONFIRMED' },
            { userId: 'qp_g_minor', status: 'CONFIRMED' },
            { userId: 'qp_g_emailer', status: 'CONFIRMED' },
          ],
        },
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: 'qp_stranger' }, update: {}, create: { id: 'qp_stranger', name: 'Stranger QA' } });
    await prisma.user.upsert({ where: { id: 'qp_g_org' }, update: { birthDate: yearsAgo(30) }, create: { id: 'qp_g_org', name: 'Org QA', birthDate: yearsAgo(30) } });
    await prisma.user.upsert({ where: { id: 'qp_g_minor' }, update: { birthDate: yearsAgo(15) }, create: { id: 'qp_g_minor', name: 'Kid QA', birthDate: yearsAgo(15) } });
    await prisma.user.upsert({ where: { id: 'qp_g_emailer' }, update: { name: EMAIL, birthDate: yearsAgo(30) }, create: { id: 'qp_g_emailer', name: EMAIL, birthDate: yearsAgo(30) } });
    field = await prisma.field.create({
      data: { name: 'מגרש בדיקה פרטיות', location: 'רחוב הבדיקות 1', price: 0, available: false, type: 'OPEN' },
    });
    game = await makeGame({ isFriendsOnly: true }); // default policy: REQUEST_TO_JOIN
    publicGame = await makeGame({ isFriendsOnly: false });
  });

  afterAll(async () => {
    const gameIds = [game?.id, publicGame?.id].filter(Boolean);
    try {
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.field.delete({ where: { id: field.id } });
    } catch (err) {
      console.warn('qaProdPrivacy cleanup skipped:', err.message);
    }
  });

  function expectNoLeak(res) {
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain('qp_g_minor');
    expect(raw).not.toContain('Kid QA');
    expect(res.body.participants).toEqual([]);
    expect(res.body.waitlistParticipants).toEqual([]);
    expect(res.body.managers).toEqual([]);
  }

  test('logged-out requests for the friends-only game and roles are rejected with 401 and carry no game data', async () => {
    for (const url of [`/api/games/${game.id}`, `/api/games/${game.id}/roles`]) {
      const res = await request(app).get(url);
      expect(res.statusCode).toBe(401);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('qp_g_');
      expect(raw).not.toContain(EMAIL);
    }
  });

  test('a logged-out request for the public game gets the sanitized guest view (no minors, no email)', async () => {
    const res = await request(app).get(`/api/games/${publicGame.id}`);
    expect(res.statusCode).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(EMAIL);
    expect(raw).not.toContain('qp_g_minor');
    expect(raw).not.toContain('Kid QA');
    expect(res.body.confirmedCount).toBe(3); // counts still include the hidden minor
  });

  test('a logged-in outsider gets no roster, no minors, no email, no address', async () => {
    const res = await request(app).get(`/api/games/${game.id}`).set(auth('qp_stranger'));
    expect(res.statusCode).toBe(200);
    expectNoLeak(res);
    expect(res.body.viewerJoinRequiresApproval).toBe(true);
    expect(res.body.confirmedCount).toBe(3); // counts survive redaction
    expect(res.body.fieldLocation).toBe('');
  });

  test('the organizer still sees the roster, with the email shown as a neutral name', async () => {
    const res = await request(app).get(`/api/games/${game.id}`).set(auth('qp_g_org'));
    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(res.body.participants.map((p) => [p.id, p.name]));
    expect(byId.qp_g_minor).toBe('Kid QA');
    expect(byId.qp_g_emailer).toBe('משתמש');
    expect(JSON.stringify(res.body)).not.toContain(EMAIL);
  });

  test('requesting to join does not unlock the roster (join response and later GETs)', async () => {
    const join = await request(app).post(`/api/games/${game.id}/join`).set(auth('qp_stranger'));
    expect(join.statusCode).toBe(200);
    expect(join.body.pending).toBe(true);
    expectNoLeak(join);

    const after = await request(app).get(`/api/games/${game.id}`).set(auth('qp_stranger'));
    expect(after.statusCode).toBe(200);
    expectNoLeak(after);
  });

  test('/roles and /leave do not hand outsiders the roster either', async () => {
    await prisma.gameRole.createMany({
      data: [
        { gameId: game.id, userId: 'qp_g_minor', role: 'MANAGER' },
        { gameId: publicGame.id, userId: 'qp_g_minor', role: 'MANAGER' },
      ],
    });
    const outsiderRoles = await request(app).get(`/api/games/${game.id}/roles`).set(auth('qp_stranger'));
    expect(outsiderRoles.statusCode).toBe(200);
    expect(outsiderRoles.body.managers).toEqual([]);
    const authedPublic = await request(app).get(`/api/games/${publicGame.id}/roles`).set(auth('qp_stranger'));
    expect(authedPublic.body.managers.map((m) => m.id)).toContain('qp_g_minor');

    // qp_stranger has a PENDING request from the previous test.
    const leave = await request(app).post(`/api/games/${game.id}/leave`).set(auth('qp_stranger'));
    expect(leave.statusCode).toBe(200);
    expectNoLeak(leave);
  });

  test('public game, signed in: roster visible, no email shown as a name', async () => {
    const res = await request(app).get(`/api/games/${publicGame.id}`).set(auth('qp_stranger'));
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(EMAIL);
    const byId = Object.fromEntries(res.body.participants.map((p) => [p.id, p.name]));
    expect(byId.qp_g_org).toBe('Org QA');
    expect(byId.qp_g_emailer).toBe('משתמש');
    expect(res.body.confirmedCount).toBe(3);
  });
});

describe('Q-04: emails are never returned as names', () => {
  test('scrub replaces email-shaped name fields only', () => {
    const body = {
      user: { name: EMAIL, email: EMAIL },
      list: [{ senderName: EMAIL }, { name: 'דנה' }, { name: 'a@b' }],
    };
    scrub(body);
    expect(body.user.name).toBe('משתמש');
    expect(body.user.email).toBe(EMAIL);
    expect(body.list[0].senderName).toBe('משתמש');
    expect(body.list[1].name).toBe('דנה');
  });

  test("the viewer's own record keeps its stored name (profile forms must not save the label)", () => {
    const body = { me: { id: 'u1', name: EMAIL }, other: { id: 'u2', name: EMAIL } };
    scrub(body, 0, 'u1');
    expect(body.me.name).toBe(EMAIL);
    expect(body.other.name).toBe('משתמש');
  });
});

describe('Q-02 follow-ups: game lists and group pages for outsiders', () => {
  let field;
  let game;
  let series;

  beforeAll(async () => {
    await prisma.user.upsert({ where: { id: 'qp_stranger' }, update: {}, create: { id: 'qp_stranger', name: 'Stranger QA' } });
    await prisma.user.upsert({ where: { id: 'qp_g_org' }, update: { birthDate: yearsAgo(30) }, create: { id: 'qp_g_org', name: 'Org QA', birthDate: yearsAgo(30) } });
    await prisma.user.upsert({ where: { id: 'qp_g_minor' }, update: { birthDate: yearsAgo(15) }, create: { id: 'qp_g_minor', name: 'Kid QA', birthDate: yearsAgo(15) } });
    field = await prisma.field.create({
      data: { name: 'מגרש רשימות פרטיות', location: 'רחוב הרשימות 2', price: 0, available: false, type: 'OPEN' },
    });
    game = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: 'qp_g_org',
        start: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        maxPlayers: 10,
        isFriendsOnly: true,
        customLocation: 'כתובת סודית 7',
        customLat: 32.1,
        customLng: 34.8,
        roles: { create: { userId: 'qp_g_org', role: 'ORGANIZER' } },
        participants: {
          create: [
            { userId: 'qp_g_org', status: 'CONFIRMED' },
            { userId: 'qp_g_minor', status: 'CONFIRMED' },
            { userId: 'qp_stranger', status: 'PENDING' },
          ],
        },
      },
    });
    series = await prisma.gameSeries.create({
      data: {
        organizerId: 'qp_g_org', fieldName: 'x', fieldLocation: 'y', maxPlayers: 10, time: '20:00',
        duration: 1, dayOfWeek: 1, type: 'WEEKLY', isFriendsOnly: true,
      },
    });
    await prisma.seriesParticipant.create({ data: { seriesId: series.id, userId: 'qp_g_minor', role: 'MEMBER' } });
  });

  afterAll(async () => {
    try {
      await prisma.chatParticipant.deleteMany({ where: { chatId: game.id } });
      await prisma.chatRoom.deleteMany({ where: { id: game.id } });
      await prisma.participation.deleteMany({ where: { gameId: game.id } });
      await prisma.gameRole.deleteMany({ where: { gameId: game.id } });
      await prisma.game.delete({ where: { id: game.id } });
      await prisma.seriesParticipant.deleteMany({ where: { seriesId: series.id } });
      await prisma.gameSeries.delete({ where: { id: series.id } });
      await prisma.field.delete({ where: { id: field.id } });
    } catch (err) {
      console.warn('qaProdPrivacy list cleanup skipped:', err.message);
    }
  });

  test('a pending outsider sees the card in lists without address or roster', async () => {
    const res = await request(app).get('/api/games/search').set(auth('qp_stranger'));
    expect(res.statusCode).toBe(200);
    const row = res.body.find((g) => g.id === game.id);
    expect(row).toBeTruthy();
    expect(row.customLocation).toBeNull();
    expect(row.customLat).toBeNull();
    expect(row.fieldLocation).toBe('');
    expect(row.participants).toEqual([]);
    expect(row.currentPlayers).toBe(2);
  });

  test('the organizer keeps the full list row', async () => {
    const res = await request(app).get('/api/games/search').set(auth('qp_g_org'));
    const row = res.body.find((g) => g.id === game.id);
    expect(row.customLocation).toBe('כתובת סודית 7');
    expect(row.participants.length).toBe(2);
  });

  test('group page: logged-out is 401, outsiders get no member list', async () => {
    const outsider = await request(app).get(`/api/series/${series.id}`).set(auth('qp_stranger'));
    expect(outsider.statusCode).toBe(200);
    expect(outsider.body.subscribers).toEqual([]);

    const anon = await request(app).get(`/api/series/${series.id}`);
    expect(anon.statusCode).toBe(401);
    expect(JSON.stringify(anon.body)).not.toContain('qp_g_minor');

    const org = await request(app).get(`/api/series/${series.id}`).set(auth('qp_g_org'));
    expect(org.body.subscribers.map((s) => s.userId)).toContain('qp_g_minor');
  });
});
