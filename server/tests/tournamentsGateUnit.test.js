// Hermetic unit tests for the tournaments gate pieces (no database).
const mockFindUnique = jest.fn();
const mockUpsert = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: {
    appSetting: { findUnique: (...a) => mockFindUnique(...a), upsert: (...a) => mockUpsert(...a) },
    tournamentRole: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    tournament: { findUnique: jest.fn().mockResolvedValue({ id: 't1', status: 'REGISTRATION_OPEN', isPublic: true }) },
  },
}));
const mockGetClerkUser = jest.fn();
jest.mock('../utils/auth', () => ({
  attachOptionalUser: (_req, _res, next) => next(),
  authenticateToken: (_req, _res, next) => next(),
  getClerkUserCached: (...a) => mockGetClerkUser(...a),
}));

const { getSetting, setSetting, invalidateSetting } = require('../utils/appSettings');
const gate = require('../utils/tournamentGate');

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('appSettings cache', () => {
  beforeEach(() => { jest.clearAllMocks(); invalidateSetting(); });

  it('a read that started before a write cannot re-cache the old value', async () => {
    const slowRead = deferred();
    mockFindUnique.mockReturnValueOnce(slowRead.promise);
    const read = getSetting('k', false);
    mockUpsert.mockResolvedValue({ value: true });
    await setSetting('k', true);
    slowRead.resolve({ value: false }); // stale row from before the write
    await read;
    mockFindUnique.mockResolvedValue({ value: true });
    expect(await getSetting('k', false)).toBe(true); // re-read from DB, not the stale cached false
  });

  it('caches reads within the TTL', async () => {
    mockFindUnique.mockResolvedValue({ value: true });
    await getSetting('k2', false);
    await getSetting('k2', false);
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe('tournamentsGate', () => {
  beforeEach(() => { jest.clearAllMocks(); invalidateSetting(); });

  it('only a stored boolean true opens the feature (e.g. the string "true" does not)', async () => {
    mockFindUnique.mockResolvedValue({ value: 'true' });
    expect(await gate.isTournamentsPublic()).toBe(false);
    invalidateSetting();
    mockFindUnique.mockResolvedValue({ value: true });
    expect(await gate.isTournamentsPublic()).toBe(true);
  });

  it('fails closed (off) when the setting cannot be read', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindUnique.mockRejectedValue(new Error('relation "AppSetting" does not exist'));
    expect(await gate.isTournamentsPublic()).toBe(false);
    console.error.mockRestore();
  });

  it('answers guests 401 when off (a banned user is dropped to a guest by attachOptionalUser)', async () => {
    mockFindUnique.mockResolvedValue({ value: false });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await gate.tournamentsGate({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('filterViewableUserIds lets a Clerk-metadata admin through', async () => {
    mockFindUnique.mockResolvedValue({ value: false });
    mockGetClerkUser.mockImplementation(async (id) => ({ publicMetadata: id === 'clerk_admin' ? { role: 'admin' } : {} }));
    expect(await gate.filterViewableUserIds(['clerk_admin', 'player'])).toEqual(['clerk_admin']);
  });

  it('evicts sockets that sit in a tournament room without access, keeps allowed ones', async () => {
    mockFindUnique.mockResolvedValue({ value: false });
    const mk = (userId, isAdmin) => ({ data: { userId, isAdmin }, rooms: new Set(['s1', 'tournament:t1']), leave: jest.fn() });
    const player = mk('p1', false);
    const admin = mk('a1', true);
    const io = { fetchSockets: jest.fn().mockResolvedValue([player, admin]) };
    expect(await gate.evictUnauthorizedTournamentSockets(io)).toBe(1);
    expect(player.leave).toHaveBeenCalledWith('tournament:t1');
    expect(admin.leave).not.toHaveBeenCalled();
  });
});

describe('reminder sweep under the gate', () => {
  it('does not claim a match whose recipients are all gated out', async () => {
    jest.resetModules();
    jest.doMock('../utils/tournamentGate', () => ({ filterViewableUserIds: jest.fn().mockResolvedValue([]) }));
    const { runReminderSweep } = require('../services/tournamentReminders');
    const now = new Date();
    const prisma = {
      $executeRaw: jest.fn(),
      tournamentMatch: { findMany: jest.fn().mockResolvedValue([{
        id: 'm1', homeTeamId: 'a', awayTeamId: 'b', scheduledAt: new Date(now.getTime() + 1000), details: null,
        tournament: { id: 't1', title: 'T' }, homeTeam: { name: 'A' }, awayTeam: { name: 'B' },
      }]) },
      tournamentTeamMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }]) },
    };
    const notificationService = { sendNotificationToMany: jest.fn() };
    const out = await runReminderSweep({ prisma, notificationService, now });
    expect(out.reminded).toBe(0);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(notificationService.sendNotificationToMany).not.toHaveBeenCalled();
  });
});
