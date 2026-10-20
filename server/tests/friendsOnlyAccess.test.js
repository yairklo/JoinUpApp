const {
  getGameAccess,
  getSeriesAccess,
  seriesVisibilityWhere,
  normalizeLinkPolicy,
} = require('../utils/friendsOnlyAccess');

// Pure unit test: a hand-rolled prisma stub, no DB connection.
function makePrisma({ friends = [], participants = [], roles = [], members = [] } = {}) {
  const pair = (a, b) => friends.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return {
    friendship: {
      findFirst: jest.fn(async ({ where }) => {
        const [first] = where.OR;
        return pair(first.userAId, first.userBId) ? { id: 'f' } : null;
      }),
    },
    participation: {
      findFirst: jest.fn(async ({ where }) =>
        participants.find((p) => p.gameId === where.gameId && p.userId === where.userId)
          ? { status: participants.find((p) => p.gameId === where.gameId && p.userId === where.userId).status || 'CONFIRMED' }
          : null),
    },
    gameRole: {
      findFirst: jest.fn(async ({ where }) =>
        roles.some((r) => r.gameId === where.gameId && r.userId === where.userId) ? { id: 'r' } : null),
    },
    seriesParticipant: {
      findUnique: jest.fn(async ({ where }) => {
        const { seriesId, userId } = where.seriesId_userId;
        return members.some((m) => m.seriesId === seriesId && m.userId === userId) ? { id: 'm' } : null;
      }),
    },
  };
}

const game = (over = {}) => ({
  id: 'g1',
  organizerId: 'org',
  isFriendsOnly: true,
  friendsOnlyUntil: null,
  friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN',
  seriesId: null,
  ...over,
});

const series = (over = {}) => ({
  id: 's1',
  organizerId: 'org',
  isFriendsOnly: true,
  friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN',
  ...over,
});

describe('getGameAccess', () => {
  test('public game is FULL for everyone, without queries', async () => {
    const prisma = makePrisma();
    expect(await getGameAccess(prisma, game({ isFriendsOnly: false, friendsOnlyLinkPolicy: 'BLOCKED' }), 'x')).toBe('FULL');
    expect(await getGameAccess(prisma, game({ isFriendsOnly: false }), undefined)).toBe('FULL');
    expect(prisma.friendship.findFirst).not.toHaveBeenCalled();
  });

  test('friendsOnlyUntil in the past makes it public', async () => {
    const past = new Date(Date.now() - 60000);
    expect(await getGameAccess(makePrisma(), game({ friendsOnlyUntil: past, friendsOnlyLinkPolicy: 'BLOCKED' }), 'x')).toBe('FULL');
  });

  test('friendsOnlyUntil in the future still applies the policy', async () => {
    const future = new Date(Date.now() + 3600000);
    expect(await getGameAccess(makePrisma(), game({ friendsOnlyUntil: future, friendsOnlyLinkPolicy: 'BLOCKED' }), 'x')).toBe('NONE');
  });

  test('anonymous viewer: REQUEST under REQUEST_TO_JOIN, NONE under BLOCKED', async () => {
    expect(await getGameAccess(makePrisma(), game(), undefined)).toBe('REQUEST');
    expect(await getGameAccess(makePrisma(), game({ friendsOnlyLinkPolicy: 'BLOCKED' }), null)).toBe('NONE');
  });

  test('stranger: REQUEST or NONE by policy', async () => {
    expect(await getGameAccess(makePrisma(), game(), 'stranger')).toBe('REQUEST');
    expect(await getGameAccess(makePrisma(), game({ friendsOnlyLinkPolicy: 'BLOCKED' }), 'stranger')).toBe('NONE');
  });

  test('missing/unknown policy falls back to REQUEST', async () => {
    expect(await getGameAccess(makePrisma(), game({ friendsOnlyLinkPolicy: undefined }), 'stranger')).toBe('REQUEST');
  });

  test('admin and organizer are FULL', async () => {
    const blocked = game({ friendsOnlyLinkPolicy: 'BLOCKED' });
    expect(await getGameAccess(makePrisma(), blocked, 'x', { isAdmin: true })).toBe('FULL');
    expect(await getGameAccess(makePrisma(), blocked, 'org')).toBe('FULL');
  });

  test('friend of the organizer is FULL', async () => {
    const prisma = makePrisma({ friends: [['friend', 'org']] });
    expect(await getGameAccess(prisma, game({ friendsOnlyLinkPolicy: 'BLOCKED' }), 'friend')).toBe('FULL');
  });

  test('a non-rejected roster row counts, from loaded participants or a query', async () => {
    const blocked = game({ friendsOnlyLinkPolicy: 'BLOCKED' });
    const prisma = makePrisma();
    expect(await getGameAccess(prisma, { ...blocked, participants: [{ userId: 'wl', status: 'WAITLISTED' }] }, 'wl')).toBe('FULL');
    expect(prisma.participation.findFirst).not.toHaveBeenCalled();

    const queried = makePrisma({ participants: [{ gameId: 'g1', userId: 'inv' }] });
    expect(await getGameAccess(queried, blocked, 'inv')).toBe('FULL');
  });

  test('a REJECTED row keeps the game viewable but forces approval again', async () => {
    const blocked = game({ friendsOnlyLinkPolicy: 'BLOCKED' });
    const loaded = { ...blocked, participants: [{ userId: 'rej', status: 'REJECTED' }], roles: [] };
    expect(await getGameAccess(makePrisma(), loaded, 'rej')).toBe('REQUEST');
    // A rejected friend of the organizer is still an insider.
    expect(await getGameAccess(makePrisma({ friends: [['rej', 'org']] }), loaded, 'rej')).toBe('FULL');
  });

  test('game role holder is FULL', async () => {
    const blocked = game({ friendsOnlyLinkPolicy: 'BLOCKED' });
    expect(await getGameAccess(makePrisma(), { ...blocked, participants: [], roles: [{ userId: 'mgr' }] }, 'mgr')).toBe('FULL');
    expect(await getGameAccess(makePrisma({ roles: [{ gameId: 'g1', userId: 'mgr' }] }), blocked, 'mgr')).toBe('FULL');
  });

  test("series member is FULL on the series' games", async () => {
    const prisma = makePrisma({ members: [{ seriesId: 's1', userId: 'member' }] });
    expect(await getGameAccess(prisma, game({ seriesId: 's1', friendsOnlyLinkPolicy: 'BLOCKED' }), 'member')).toBe('FULL');
    expect(await getGameAccess(prisma, game({ seriesId: 's2', friendsOnlyLinkPolicy: 'BLOCKED' }), 'member')).toBe('NONE');
  });
});

describe('getSeriesAccess', () => {
  test('public group is FULL', async () => {
    expect(await getSeriesAccess(makePrisma(), series({ isFriendsOnly: false }), undefined)).toBe('FULL');
  });

  test('outsiders get REQUEST or NONE by policy', async () => {
    expect(await getSeriesAccess(makePrisma(), series(), 'x')).toBe('REQUEST');
    expect(await getSeriesAccess(makePrisma(), series(), undefined)).toBe('REQUEST');
    expect(await getSeriesAccess(makePrisma(), series({ friendsOnlyLinkPolicy: 'BLOCKED' }), 'x')).toBe('NONE');
    expect(await getSeriesAccess(makePrisma(), series({ friendsOnlyLinkPolicy: 'BLOCKED' }), undefined)).toBe('NONE');
  });

  test('admin, organizer, member and friend are FULL', async () => {
    const blocked = series({ friendsOnlyLinkPolicy: 'BLOCKED' });
    const prisma = makePrisma({ friends: [['org', 'friend']], members: [{ seriesId: 's1', userId: 'member' }] });
    expect(await getSeriesAccess(prisma, blocked, 'x', { isAdmin: true })).toBe('FULL');
    expect(await getSeriesAccess(prisma, blocked, 'org')).toBe('FULL');
    expect(await getSeriesAccess(prisma, blocked, 'member')).toBe('FULL');
    expect(await getSeriesAccess(prisma, blocked, 'friend')).toBe('FULL');
  });
});

describe('helpers', () => {
  test('seriesVisibilityWhere hides friends-only groups from anonymous viewers', () => {
    expect(seriesVisibilityWhere(undefined)).toEqual({ isFriendsOnly: false });
    const where = seriesVisibilityWhere('u1');
    expect(where.OR).toEqual(expect.arrayContaining([{ isFriendsOnly: false }, { organizerId: 'u1' }]));
  });

  test('normalizeLinkPolicy accepts only the two values', () => {
    expect(normalizeLinkPolicy('BLOCKED')).toBe('BLOCKED');
    expect(normalizeLinkPolicy('REQUEST_TO_JOIN')).toBe('REQUEST_TO_JOIN');
    expect(normalizeLinkPolicy('OPEN')).toBeUndefined();
    expect(normalizeLinkPolicy(undefined)).toBeUndefined();
  });
});
