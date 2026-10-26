const request = require('supertest');

jest.setTimeout(30000);

// Signed-out GET /api/games/:id: public games return a sanitized guest view, friends-only games
// ask the guest to sign in (401 SIGN_IN_REQUIRED) without revealing anything about the game.

const USERS = {
  tok_gg_org: { id: 'gg_org', name: 'Guest Org' },
  tok_gg_adult: { id: 'gg_adult', name: 'Adult Player' },
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

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({ startCleanupWorker: jest.fn(), runCleanup: jest.fn() }));

const { prisma } = require('../services/gameService');
const { app } = require('../index');

const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000);
const FIELD_NAME = 'מגרש בדיקה אורחים';
const FIELD_LOCATION = 'רחוב האורחים 7';
const SECRET_TITLE = 'gg secret friends game';

const PEOPLE = [
  { id: 'gg_org', name: 'Guest Org', email: 'gg_org@example.test', phone: '0501111111', birthDate: yearsAgo(35) },
  { id: 'gg_adult', name: 'Adult Player', email: 'gg_adult@example.test', phone: '0502222222', birthDate: yearsAgo(28) },
  { id: 'gg_minor', name: 'Kid Guest', email: 'gg_minor@example.test', phone: '0503333333', birthDate: yearsAgo(15) },
  { id: 'gg_wait', name: 'Waiting Player', email: 'gg_wait@example.test', birthDate: yearsAgo(30) },
  { id: 'gg_pending', name: 'Pending Player', email: 'gg_pending@example.test', birthDate: yearsAgo(30) },
];

const FORBIDDEN_KEYS = ['email', 'phone', 'phoneNumber', 'birthDate', 'age', 'chatRoomId', 'managerPickChatId',
  'pickTurnOrder', 'viewerIsInsider', 'waitlistParticipants', 'managers', 'teams', 'pendingRequestCount',
  'welcomeMessage', 'guestWelcomeMessage', 'viewerParticipationStatus', 'waitlistOfferPending'];

/** Every key name in a JSON value, at any depth. */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe('GET /api/games/:id for signed-out guests', () => {
  let field;
  const gameIds = [];

  async function makeGame(extra = {}) {
    const game = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: 'gg_org',
        start: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        maxPlayers: 10,
        price: 30,
        welcomeMessage: 'gg welcome text',
        roles: { create: { userId: 'gg_org', role: 'ORGANIZER' } },
        participants: {
          create: [
            { userId: 'gg_org', status: 'CONFIRMED' },
            { userId: 'gg_adult', status: 'CONFIRMED' },
            { userId: 'gg_minor', status: 'CONFIRMED' },
            { userId: 'gg_wait', status: 'WAITLISTED' },
            { userId: 'gg_pending', status: 'PENDING' },
          ],
        },
        ...extra,
      },
    });
    gameIds.push(game.id);
    return game;
  }

  let publicGame;
  let requestGame;
  let blockedGame;

  beforeAll(async () => {
    for (const p of PEOPLE) {
      const { id, ...data } = p;
      await prisma.user.upsert({ where: { id }, update: data, create: { id, ...data } });
    }
    field = await prisma.field.create({
      data: { name: FIELD_NAME, location: FIELD_LOCATION, price: 0, available: false, type: 'OPEN' },
    });
    publicGame = await makeGame({ title: 'gg public game' });
    requestGame = await makeGame({ title: SECRET_TITLE, isFriendsOnly: true, friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' });
    blockedGame = await makeGame({ title: SECRET_TITLE, isFriendsOnly: true, friendsOnlyLinkPolicy: 'BLOCKED' });
  });

  afterAll(async () => {
    try {
      await prisma.chatParticipant.deleteMany({ where: { chatId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.field.delete({ where: { id: field.id } });
    } catch (err) {
      console.warn('guestGameDetails cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  test('a public game returns 200 with a sanitized guest view', async () => {
    const res = await request(app).get(`/api/games/${publicGame.id}`);
    expect(res.statusCode).toBe(200);

    const keys = allKeys(res.body);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);

    const raw = JSON.stringify(res.body);
    for (const p of PEOPLE) {
      expect(raw).not.toContain(p.email);
      if (p.phone) expect(raw).not.toContain(p.phone);
    }
    // No minors, no waitlisted or pending players on the roster.
    expect(raw).not.toContain('gg_minor');
    expect(raw).not.toContain('Kid Guest');
    expect(raw).not.toContain('gg_wait');
    expect(raw).not.toContain('gg_pending');
    expect(raw).not.toContain('gg welcome text');

    expect(res.body.participants.map((p) => p.id).sort()).toEqual(['gg_adult', 'gg_org']);
    for (const p of res.body.participants) expect(Object.keys(p).sort()).toEqual(['avatar', 'id', 'name']);

    // What a guest needs to decide whether to sign in and join.
    expect(res.body).toMatchObject({
      id: publicGame.id,
      title: 'gg public game',
      fieldName: FIELD_NAME,
      fieldLocation: FIELD_LOCATION,
      maxPlayers: 10,
      price: 30,
      confirmedCount: 3, // counts still include the hidden minor
      currentPlayers: 3,
      waitlistCount: 1,
    });
    expect(typeof res.body.start).toBe('string');
  });

  test.each([
    ['REQUEST_TO_JOIN', () => requestGame],
    ['BLOCKED', () => blockedGame],
  ])('a friends-only game (%s link) asks a guest to sign in and reveals nothing', async (_policy, getGame) => {
    const res = await request(app).get(`/api/games/${getGame().id}`);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sign in to view this game', code: 'SIGN_IN_REQUIRED' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(SECRET_TITLE);
    expect(raw).not.toContain(FIELD_NAME);
    expect(raw).not.toContain(FIELD_LOCATION);
    expect(raw).not.toContain('gg_');
  });

  test('a signed-in participant still gets the full DTO', async () => {
    const res = await request(app).get(`/api/games/${publicGame.id}`).set(auth('tok_gg_adult'));
    expect(res.statusCode).toBe(200);
    expect(res.body.viewerParticipationStatus).toBe('CONFIRMED');
    expect(res.body.chatRoomId).toBe(publicGame.id);
    expect(res.body.managers).toEqual([]);
    expect(res.body.waitlistParticipants.map((p) => p.id)).toEqual(['gg_wait']);
    // Minors are only hidden from anonymous viewers.
    expect(res.body.participants.map((p) => p.id).sort()).toEqual(['gg_adult', 'gg_minor', 'gg_org']);
    expect(Array.isArray(res.body.teams)).toBe(true);
  });

  test('the organizer of a friends-only game still sees it', async () => {
    const res = await request(app).get(`/api/games/${blockedGame.id}`).set(auth('tok_gg_org'));
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe(SECRET_TITLE);
  });

  test.each(['roles', 'ratings'])('/api/games/:id/%s stays 401 for guests', async (sub) => {
    const res = await request(app).get(`/api/games/${publicGame.id}/${sub}`);
    expect(res.statusCode).toBe(401);
  });
});
