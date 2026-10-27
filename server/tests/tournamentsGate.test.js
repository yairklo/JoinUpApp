const request = require('supertest');

jest.setTimeout(60000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { verifyToken } = require('@clerk/backend');
const { app, socketAuthMiddleware } = require('../index');
const { prisma, ensureUsers, tournamentBody, cleanup } = require('./helpers/tournamentFixtures');
const { invalidateSetting } = require('../utils/appSettings');
const { canViewTournaments, canJoinTournamentRoom, filterViewableUserIds } = require('../utils/tournamentGate');

const P = 'tgate_';
const ADMIN = `${P}admin`;
const CREATOR = `${P}creator`;
const HOLDER = `${P}holder`;
const PLAIN = `${P}plain`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const OLD_ADMINS = process.env.ADMIN_USER_IDS;
const ENV_ADMIN = `${P}envadmin`;

const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);
const setPublic = async (value) => {
  await prisma.appSetting.upsert({ where: { key: 'tournamentsPublic' }, update: { value }, create: { key: 'tournamentsPublic', value } });
  invalidateSetting('tournamentsPublic');
};

describe('tournaments feature gate (tournamentsPublic)', () => {
  let t;
  let previousSetting = null;

  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = CREATOR;
    process.env.ADMIN_USER_IDS = ENV_ADMIN;
    previousSetting = await prisma.appSetting.findUnique({ where: { key: 'tournamentsPublic' } });
    await cleanup(P);
    await ensureUsers([ADMIN, CREATOR, HOLDER, PLAIN, ENV_ADMIN]);
    await setPublic(true);
    const res = await as('post', '/api/tournaments', CREATOR).send(tournamentBody());
    t = res.body;
    await prisma.tournament.update({ where: { id: t.id }, data: { status: 'REGISTRATION_OPEN', isPublic: true } });
    await prisma.tournamentRole.create({ data: { tournamentId: t.id, userId: HOLDER, role: 'SCOREKEEPER' } });
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    process.env.ADMIN_USER_IDS = OLD_ADMINS;
    await cleanup(P);
    if (previousSetting) await setPublic(previousSetting.value);
    else await prisma.appSetting.deleteMany({ where: { key: 'tournamentsPublic' } });
    invalidateSetting();
    await prisma.$disconnect();
  });

  describe('tournamentsPublic = false', () => {
    beforeAll(() => setPublic(false));

    it('guest gets 401 on list, detail and a nested read', async () => {
      expect((await request(app).get('/api/tournaments')).status).toBe(401);
      expect((await request(app).get(`/api/tournaments/${t.id}`)).status).toBe(401);
      expect((await request(app).get(`/api/tournaments/${t.id}/standings`)).status).toBe(401);
    });

    it('regular player gets 404 everywhere, including writes and my-invites', async () => {
      expect((await as('get', '/api/tournaments', PLAIN)).status).toBe(404);
      expect((await as('get', `/api/tournaments/${t.id}`, PLAIN)).status).toBe(404);
      expect((await as('get', '/api/tournaments/my-invites', PLAIN)).status).toBe(404);
      expect((await as('post', '/api/tournaments', PLAIN).send(tournamentBody())).status).toBe(404);
    });

    it('creator, role holder and admin get 200', async () => {
      for (const u of [CREATOR, HOLDER, `${ADMIN}:admin`]) {
        expect((await as('get', '/api/tournaments', u)).status).toBe(200);
        expect((await as('get', `/api/tournaments/${t.id}`, u)).status).toBe(200);
      }
    });

    it('capabilities works for guests and reflects the viewer', async () => {
      const guest = await request(app).get('/api/tournaments/capabilities');
      expect(guest.status).toBe(200);
      expect(guest.body).toMatchObject({ public: false, canView: false, canCreate: false });
      expect((await as('get', '/api/tournaments/capabilities', PLAIN)).body).toMatchObject({ canView: false, canCreate: false });
      expect((await as('get', '/api/tournaments/capabilities', HOLDER)).body).toMatchObject({ canView: true, canCreate: false });
      expect((await as('get', '/api/tournaments/capabilities', CREATOR)).body).toMatchObject({ canView: true, canCreate: true });
    });

    it('socket join rule (canViewTournaments) matches the HTTP gate', async () => {
      expect(await canViewTournaments(null)).toBe(false);
      expect(await canViewTournaments({ id: PLAIN })).toBe(false);
      expect(await canViewTournaments({ id: HOLDER })).toBe(true);
      expect(await canViewTournaments({ id: CREATOR })).toBe(true);
      expect(await canViewTournaments({ id: ADMIN, isAdmin: true })).toBe(true);
    });

    it('an ADMIN_USER_IDS admin with no TournamentRole can join the live room (socket.data.isAdmin)', async () => {
      const connect = async (sub) => {
        verifyToken.mockResolvedValue({ sub });
        const socket = { handshake: { auth: { token: 'good' }, headers: {} } };
        const next = jest.fn();
        await socketAuthMiddleware(socket, next);
        expect(next).toHaveBeenCalledWith();
        return { id: socket.userId, isAdmin: !!socket.data.isAdmin };
      };
      const admin = await connect(ENV_ADMIN);
      expect(admin.isAdmin).toBe(true);
      expect(await prisma.tournamentRole.count({ where: { userId: ENV_ADMIN } })).toBe(0);
      expect(await canJoinTournamentRoom(admin, t.id)).toBe(true);
      expect(await canJoinTournamentRoom(await connect(PLAIN), t.id)).toBe(false);
      expect(await canJoinTournamentRoom(await connect(HOLDER), t.id)).toBe(true);
    });

    it('notification recipients are filtered the same way', async () => {
      expect((await filterViewableUserIds([PLAIN, HOLDER, CREATOR])).sort()).toEqual([CREATOR, HOLDER].sort());
    });
  });

  describe('tournamentsPublic = true', () => {
    beforeAll(() => setPublic(true));

    it('guest and player read public tournaments as before', async () => {
      const list = await request(app).get('/api/tournaments');
      expect(list.status).toBe(200);
      expect(list.body.map((x) => x.id)).toContain(t.id);
      expect((await request(app).get(`/api/tournaments/${t.id}`)).status).toBe(200);
      expect((await as('get', `/api/tournaments/${t.id}`, PLAIN)).status).toBe(200);
    });

    it('capabilities reports public for guests; socket rule and recipients open up', async () => {
      expect((await request(app).get('/api/tournaments/capabilities')).body).toMatchObject({ public: true, canView: true, canCreate: false });
      expect(await canViewTournaments(null)).toBe(true);
      expect(await filterViewableUserIds([PLAIN])).toEqual([PLAIN]);
    });
  });

  describe('/api/admin/settings', () => {
    it('is admin-only', async () => {
      expect((await request(app).get('/api/admin/settings')).status).toBe(401);
      expect((await as('get', '/api/admin/settings', PLAIN)).status).toBe(403);
      expect((await as('put', '/api/admin/settings', PLAIN).send({ tournamentsPublic: true })).status).toBe(403);
    });

    it('admin reads and toggles; the gate follows immediately (cache invalidated)', async () => {
      await setPublic(false);
      expect((await as('get', '/api/admin/settings', `${ADMIN}:admin`)).body).toEqual({ tournamentsPublic: false });
      expect((await as('get', '/api/tournaments', PLAIN)).status).toBe(404);
      const put = await as('put', '/api/admin/settings', `${ADMIN}:admin`).send({ tournamentsPublic: true });
      expect(put.status).toBe(200);
      expect(put.body).toEqual({ tournamentsPublic: true });
      expect((await as('get', '/api/tournaments', PLAIN)).status).toBe(200);
    });

    it('rejects non-boolean and unknown payloads', async () => {
      expect((await as('put', '/api/admin/settings', `${ADMIN}:admin`).send({ tournamentsPublic: 'yes' })).status).toBe(400);
      expect((await as('put', '/api/admin/settings', `${ADMIN}:admin`).send({ other: 1 })).status).toBe(400);
      const mixed = await as('put', '/api/admin/settings', `${ADMIN}:admin`).send({ tournamentsPublic: true, other: 1 });
      expect(mixed.status).toBe(400);
      expect(mixed.body.error).toMatch(/other/);
    });
  });
});
