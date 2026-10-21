const request = require('supertest');

jest.setTimeout(30000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { canCreateTournament, getTournamentRole, hasRoleAtLeast } = require('../utils/tournamentAccess');

describe('canCreateTournament', () => {
  const OLD = process.env.TOURNAMENT_CREATOR_IDS;
  afterEach(() => { process.env.TOURNAMENT_CREATOR_IDS = OLD; });

  it('allows admins and allowlisted ids only', () => {
    process.env.TOURNAMENT_CREATOR_IDS = 'ta_a, ta_b';
    expect(canCreateTournament({ id: 'ta_x', isAdmin: true })).toBe(true);
    expect(canCreateTournament({ id: 'ta_b' })).toBe(true);
    expect(canCreateTournament({ id: 'ta_c' })).toBe(false);
    expect(canCreateTournament(null)).toBe(false);
  });

  it('denies everyone when the allowlist is empty', () => {
    delete process.env.TOURNAMENT_CREATOR_IDS;
    expect(canCreateTournament({ id: 'ta_a' })).toBe(false);
  });
});

describe('getTournamentRole', () => {
  const t = { id: 't1', organizerId: 'org' };
  const db = (role) => ({ tournamentRole: { findUnique: jest.fn().mockResolvedValue(role ? { role } : null) } });

  it('resolves owner, admin, stored role and stranger', async () => {
    expect(await getTournamentRole(db(), t, { id: 'org' })).toBe('ORGANIZER');
    expect(await getTournamentRole(db(), t, { id: 'x', isAdmin: true })).toBe('ORGANIZER');
    expect(await getTournamentRole(db('MANAGER'), t, { id: 'm' })).toBe('MANAGER');
    expect(await getTournamentRole(db(), t, { id: 'nobody' })).toBeNull();
    expect(await getTournamentRole(db(), t, null)).toBeNull();
  });

  it('orders roles', () => {
    expect(hasRoleAtLeast('MANAGER', 'SCOREKEEPER')).toBe(true);
    expect(hasRoleAtLeast('SCOREKEEPER', 'MANAGER')).toBe(false);
    expect(hasRoleAtLeast(null, 'SCOREKEEPER')).toBe(false);
  });
});

describe('GET /api/tournaments/capabilities', () => {
  const OLD = process.env.TOURNAMENT_CREATOR_IDS;
  beforeAll(() => { process.env.TOURNAMENT_CREATOR_IDS = 'ta_creator'; });
  afterAll(() => { process.env.TOURNAMENT_CREATOR_IDS = OLD; });

  it('requires auth', async () => {
    expect((await request(app).get('/api/tournaments/capabilities')).status).toBe(401);
  });

  it('reports the flag per caller', async () => {
    const get = (token) => request(app).get('/api/tournaments/capabilities').set('Authorization', `Bearer ${token}`);
    expect((await get('ta_creator')).body).toEqual({ canCreateTournaments: true });
    expect((await get('ta_plain')).body).toEqual({ canCreateTournaments: false });
    expect((await get('ta_plain:admin')).body).toEqual({ canCreateTournaments: true });
  });
});
