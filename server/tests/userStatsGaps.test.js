const request = require('supertest');

jest.setTimeout(60000);

const USERS = {
  tok_owner: { id: 'usg_owner', name: 'Owner' },
  tok_stranger: { id: 'usg_stranger', name: 'Stranger' },
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
    invalidateAccountState: jest.fn(),
  };
});

const { prisma } = require('../lib/prisma');
const { app } = require('../index');

const OWNER = 'usg_owner';
const STRANGER = 'usg_stranger';
const OPP = 'usg_opp';
const ALL = [OWNER, STRANGER, OPP];
const HOUR = 3600 * 1000;
const auth = (tok) => ({ Authorization: `Bearer ${tok}` });

describe('user stats gaps: ownerHidden + team-derived history badge', () => {
  let field;
  let game;
  const get = (path, tok) => request(app).get(path).set(auth(tok));

  beforeAll(async () => {
    for (const id of ALL) await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } });
    field = await prisma.field.create({ data: { name: 'usg field', location: 'x', price: 0, available: false, type: 'OPEN' } });
    game = await prisma.game.create({
      data: { fieldId: field.id, organizerId: OPP, sport: 'SOCCER', start: new Date(Date.now() - 48 * HOUR), maxPlayers: 10 },
    });
    const [red, blue] = await Promise.all([
      prisma.team.create({ data: { gameId: game.id, name: 'Red', color: 'red' } }),
      prisma.team.create({ data: { gameId: game.id, name: 'Blue', color: 'blue' } }),
    ]);
    await prisma.participation.createMany({
      data: [
        { gameId: game.id, userId: OWNER, status: 'CONFIRMED', teamId: blue.id },
        { gameId: game.id, userId: OPP, status: 'CONFIRMED', teamId: red.id },
      ],
    });
    const result = await prisma.gameResult.create({
      data: { gameId: game.id, sport: 'SOCCER', recordedById: OPP, lockedAt: new Date(Date.now() + 7 * 24 * HOUR) },
    });
    const round = await prisma.gameResultRound.create({ data: { resultId: result.id, order: 1 } });
    await prisma.gameResultSide.createMany({
      data: [
        { resultId: result.id, roundId: round.id, order: 0, teamId: red.id, label: 'Red', score: 1, outcome: 'LOSS' },
        { resultId: result.id, roundId: round.id, order: 1, teamId: blue.id, label: 'Blue', score: 4, outcome: 'WIN' },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma.gameResult.deleteMany({ where: { gameId: game.id } });
      await prisma.participation.deleteMany({ where: { gameId: game.id } });
      await prisma.team.deleteMany({ where: { gameId: game.id } });
      await prisma.game.delete({ where: { id: game.id } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: ALL } } });
    } catch (err) {
      console.warn('userStatsGaps cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  afterEach(() => prisma.user.update({ where: { id: OWNER }, data: { hideMatchStats: false } }));

  test('history badge is derived from the participation team when there are no stat rows', async () => {
    const res = await get(`/api/users/${OWNER}/match-history?take=10`, 'tok_stranger');
    const item = res.body.find((g) => g.id === game.id);
    expect(item.result).toEqual({ outcome: 'WIN', score: '4-1', myStats: {} });
    // the opponent (red team) sees the mirrored badge
    const opp = await get(`/api/users/${OPP}/match-history?take=10`, 'tok_stranger');
    expect(opp.body.find((g) => g.id === game.id).result).toMatchObject({ outcome: 'LOSS', score: '1-4' });
  });

  test('no badge when the participant has no team and no stat rows', async () => {
    await prisma.participation.update({ where: { gameId_userId: { gameId: game.id, userId: OWNER } }, data: { teamId: null } });
    try {
      const res = await get(`/api/users/${OWNER}/match-history?take=10`, 'tok_stranger');
      expect('result' in res.body.find((g) => g.id === game.id)).toBe(false);
    } finally {
      const blue = await prisma.team.findFirst({ where: { gameId: game.id, name: 'Blue' } });
      await prisma.participation.update({ where: { gameId_userId: { gameId: game.id, userId: OWNER } }, data: { teamId: blue.id } });
    }
  });

  test('ownerHidden only for the owner while hideMatchStats is on', async () => {
    const before = await get(`/api/users/${OWNER}/stats`, 'tok_owner');
    expect('ownerHidden' in before.body).toBe(false);

    await prisma.user.update({ where: { id: OWNER }, data: { hideMatchStats: true } });
    const own = await get(`/api/users/${OWNER}/stats`, 'tok_owner');
    expect(own.body).toMatchObject({ visible: true, ownerHidden: true });
    const stranger = await get(`/api/users/${OWNER}/stats`, 'tok_stranger');
    expect(stranger.body).toEqual({ visible: false, hiddenReason: 'USER_HIDDEN', sports: [] });

    const profileOwn = await get(`/api/users/${OWNER}`, 'tok_owner');
    expect(profileOwn.body.ownerHidden).toBe(true);
    const profileOther = await get(`/api/users/${OWNER}`, 'tok_stranger');
    expect('ownerHidden' in profileOther.body).toBe(false);
  });
});
