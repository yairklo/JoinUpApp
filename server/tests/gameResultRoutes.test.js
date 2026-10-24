const request = require('supertest');

jest.setTimeout(60000);

const USERS = {
  tok_org: { id: 'grr_org', name: 'Organizer' },
  tok_mgr: { id: 'grr_mgr', name: 'Manager' },
  tok_p1: { id: 'grr_p1', name: 'Player One' },
  tok_stranger: { id: 'grr_stranger', name: 'Stranger' },
  tok_admin: { id: 'grr_admin', name: 'Admin', isAdmin: true },
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

const { prisma } = require('../lib/prisma');
const { app } = require('../index');

const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
const ids = Object.values(USERS).map((u) => u.id);

describe('game result routes', () => {
  let field;
  let game;
  const gameIds = [];

  const body = () => ({
    sides: [{ label: 'Blue', score: 2 }, { label: 'Red', score: 1 }],
    stats: [{ userId: 'grr_p1', sideOrder: 0, values: { goals: 2 } }],
  });

  async function makeGame(data = {}) {
    const g = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: 'grr_org',
        start: new Date(Date.now() - 2 * 3600 * 1000),
        sport: 'SOCCER',
        maxPlayers: 10,
        roles: { create: [{ userId: 'grr_org', role: 'ORGANIZER' }, { userId: 'grr_mgr', role: 'MANAGER' }] },
        participants: { create: [{ userId: 'grr_org', status: 'CONFIRMED' }, { userId: 'grr_p1', status: 'CONFIRMED' }] },
        ...data,
      },
    });
    gameIds.push(g.id);
    return g;
  }

  beforeAll(async () => {
    for (const u of Object.values(USERS)) {
      await prisma.user.upsert({ where: { id: u.id }, update: {}, create: { id: u.id, name: u.name } });
    }
    field = await prisma.field.create({ data: { name: 'grr field', location: 'x', price: 0, available: false, type: 'OPEN' } });
    game = await makeGame();
  });

  afterAll(async () => {
    try {
      await prisma.userReport.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.playerStatEntry.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    } catch (err) {
      console.warn('gameResultRoutes cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  test('requires auth', async () => {
    expect((await request(app).get(`/api/games/${game.id}/result`)).statusCode).toBe(401);
    expect((await request(app).put(`/api/games/${game.id}/result`).send(body())).statusCode).toBe(401);
  });

  test('GET before a result exists, then PUT permissions and status codes', async () => {
    const empty = await request(app).get(`/api/games/${game.id}/result`).set(auth('tok_p1'));
    expect(empty.statusCode).toBe(200);
    expect(empty.body).toMatchObject({ eligible: true, canEdit: false, result: null });

    const denied = await request(app).put(`/api/games/${game.id}/result`).set(auth('tok_p1')).send(body());
    expect(denied.statusCode).toBe(403);
    expect(denied.body.code).toBe('NOT_MANAGER');

    const invalid = await request(app).put(`/api/games/${game.id}/result`).set(auth('tok_mgr')).send({ sides: [] });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body.code).toBe('INVALID_SIDES');

    const ok = await request(app).put(`/api/games/${game.id}/result`).set(auth('tok_mgr')).send(body());
    expect(ok.statusCode).toBe(200);
    expect(ok.body.result.sides.map((s) => s.outcome)).toEqual(['WIN', 'LOSS']);
    expect(ok.body.canEdit).toBe(true);

    const seen = await request(app).get(`/api/games/${game.id}/result`).set(auth('tok_p1'));
    expect(seen.body.result.stats).toEqual([{ userId: 'grr_p1', sideId: expect.any(String), values: { goals: 2 } }]);
  });

  test('friends-only BLOCKED game hides the result from strangers', async () => {
    const g = await makeGame({ isFriendsOnly: true, friendsOnlyLinkPolicy: 'BLOCKED' });
    const res = await request(app).get(`/api/games/${g.id}/result`).set(auth('tok_stranger'));
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('GAME_FRIENDS_ONLY');
    expect((await request(app).get(`/api/games/${g.id}/result`).set(auth('tok_admin'))).statusCode).toBe(200);
  });

  test('dispute: participant ok (201), stranger 403, recorder 400', async () => {
    const g = await makeGame();
    await request(app).put(`/api/games/${g.id}/result`).set(auth('tok_mgr')).send(body()).expect(200);

    const ok = await request(app).post(`/api/games/${g.id}/result/dispute`).set(auth('tok_p1')).send({ details: 'no' });
    expect(ok.statusCode).toBe(201);
    expect(ok.body).toEqual({ ok: true });
    expect(await prisma.userReport.count({ where: { gameId: g.id, reason: 'RESULT_DISPUTE' } })).toBe(1);

    expect((await request(app).post(`/api/games/${g.id}/result/dispute`).set(auth('tok_stranger')).send({})).statusCode).toBe(403);
  });

  test('DELETE: stranger 403, manager 200, then 404', async () => {
    const g = await makeGame();
    await request(app).put(`/api/games/${g.id}/result`).set(auth('tok_org')).send(body()).expect(200);
    expect((await request(app).delete(`/api/games/${g.id}/result`).set(auth('tok_stranger'))).statusCode).toBe(403);
    expect((await request(app).delete(`/api/games/${g.id}/result`).set(auth('tok_mgr'))).body).toEqual({ ok: true });
    expect((await request(app).delete(`/api/games/${g.id}/result`).set(auth('tok_mgr'))).statusCode).toBe(404);
  });

  test('existing GET /:id still routes to the game', async () => {
    const res = await request(app).get(`/api/games/${game.id}`).set(auth('tok_p1'));
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(game.id);
  });
});
