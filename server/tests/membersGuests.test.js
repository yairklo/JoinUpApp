const {
  getGameAccess,
  getSeriesJoinAccess,
} = require('../utils/friendsOnlyAccess');
const {
  resolveGuestRegistrationOpensAt,
  isGuestWindowOrderValid,
  isGameInsider,
  isGuestWindowClosed,
  pickWelcomeMessage,
  guestGameData,
} = require('../utils/membersGuests');

// Pure unit test: hand-rolled prisma stub, no DB.
function makePrisma({ friends = [], members = [], roles = [] } = {}) {
  return {
    friendship: {
      findFirst: jest.fn(async ({ where }) => {
        const [first] = where.OR;
        return friends.some(([a, b]) => (a === first.userAId && b === first.userBId) || (a === first.userBId && b === first.userAId))
          ? { id: 'f' } : null;
      }),
    },
    participation: { findFirst: jest.fn(async () => null) },
    gameRole: {
      findFirst: jest.fn(async ({ where }) => (roles.some((r) => r.userId === where.userId) ? { id: 'r' } : null)),
    },
    seriesParticipant: {
      findUnique: jest.fn(async ({ where }) => {
        const { seriesId, userId } = where.seriesId_userId;
        return members.some((m) => m.seriesId === seriesId && m.userId === userId) ? { id: 'm' } : null;
      }),
    },
    gameSeries: {
      findUnique: jest.fn(async () => ({
        isFriendsOnly: false,
        joinPolicy: 'INSTANT',
        membersOnlyPriority: true,
      })),
    },
  };
}

const HOUR = 3600000;
const start = new Date('2030-01-10T18:00:00Z');
const series = (over = {}) => ({
  id: 's1', organizerId: 'org', isFriendsOnly: false, friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN',
  membersOnlyPriority: true, guestRegistrationOpenHours: 24, ...over,
});
const game = (over = {}) => ({
  id: 'g1', organizerId: 'org', seriesId: 's1', isFriendsOnly: false, membersOnlyPriority: true,
  registrationOpensAt: new Date(start.getTime() - 72 * HOUR),
  guestRegistrationOpensAt: new Date(start.getTime() - 24 * HOUR),
  ...over,
});
const prismaWith = () => makePrisma({ friends: [['org', 'friend']], members: [{ seriesId: 's1', userId: 'member' }] });

describe('guest window math', () => {
  test('guest window is hours before start, only when priority is on', () => {
    expect(resolveGuestRegistrationOpensAt(series(), start)).toEqual(new Date(start.getTime() - 24 * HOUR));
    expect(resolveGuestRegistrationOpensAt(series({ membersOnlyPriority: false }), start)).toBeNull();
    expect(resolveGuestRegistrationOpensAt(series({ guestRegistrationOpenHours: null }), start)).toBeNull();
  });

  test('members window must not open after the guest window', () => {
    const a = new Date(start.getTime() - 72 * HOUR);
    expect(isGuestWindowOrderValid(a, new Date(start.getTime() - 24 * HOUR))).toBe(true);
    expect(isGuestWindowOrderValid(a, a)).toBe(true);
    expect(isGuestWindowOrderValid(a, new Date(start.getTime() - 96 * HOUR))).toBe(false);
    expect(isGuestWindowOrderValid(null, a)).toBe(true);
    expect(isGuestWindowOrderValid(a, null)).toBe(true);
  });

  test('guestGameData copies the group config onto a game, with a per-game override', () => {
    const cfg = series({ guestDescription: 'd', guestWelcomeMessage: 'w', guestPrice: 30 });
    expect(guestGameData(cfg, start)).toEqual({
      membersOnlyPriority: true,
      guestRegistrationOpensAt: new Date(start.getTime() - 24 * HOUR),
      guestWelcomeMessage: 'w', guestDescription: 'd', guestPrice: 30,
    });
    const override = new Date(start.getTime() - 10 * HOUR);
    expect(guestGameData(cfg, start, override).guestRegistrationOpensAt).toEqual(override);
    expect(guestGameData(series({ membersOnlyPriority: false }), start).guestRegistrationOpensAt).toBeNull();
  });
});

describe('who gets which registration window', () => {
  const beforeGuests = new Date(start.getTime() - 48 * HOUR); // inside A..B
  const afterGuests = new Date(start.getTime() - 2 * HOUR); // after B

  test('member, organizer, admin and game manager are insiders; friend-non-member and stranger are guests', async () => {
    const p = prismaWith();
    expect(await isGameInsider(p, game(), 'member')).toBe(true);
    expect(await isGameInsider(p, game(), 'org')).toBe(true);
    expect(await isGameInsider(p, game(), 'stranger', { isAdmin: true })).toBe(true);
    expect(await isGameInsider(makePrisma({ roles: [{ userId: 'mgr' }] }), game(), 'mgr')).toBe(true);
    expect(await isGameInsider(p, game(), 'friend')).toBe(false);
    expect(await isGameInsider(p, game(), 'stranger')).toBe(false);
    expect(await isGameInsider(p, game(), null)).toBe(false);
  });

  test('guest window is closed in A..B and open from B; never on a game without priority', () => {
    expect(isGuestWindowClosed(game(), beforeGuests)).toBe(true);
    expect(isGuestWindowClosed(game(), afterGuests)).toBe(false);
    expect(isGuestWindowClosed(game({ membersOnlyPriority: false }), beforeGuests)).toBe(false);
    expect(isGuestWindowClosed(game({ guestRegistrationOpensAt: null }), beforeGuests)).toBe(false);
  });
});

describe('friends are not insiders on a members-priority game', () => {
  test('friends-only game: friend non-member must request, member joins', async () => {
    const p = prismaWith();
    const g = game({ isFriendsOnly: true });
    expect(await getGameAccess(p, g, 'friend')).toBe('REQUEST');
    expect(await getGameAccess(p, g, 'member')).toBe('FULL');
    expect(await getGameAccess(p, g, 'org')).toBe('FULL');
  });

  test('without priority a friend is still an insider (existing behavior)', async () => {
    const p = prismaWith();
    expect(await getGameAccess(p, game({ isFriendsOnly: true, membersOnlyPriority: false }), 'friend')).toBe('FULL');
  });
});

describe('joining the group needs approval for non-members', () => {
  test('friend and stranger need approval; member, organizer and admin do not', async () => {
    const p = prismaWith();
    expect(await getSeriesJoinAccess(p, series(), 'friend')).toBe('REQUEST');
    expect(await getSeriesJoinAccess(p, series(), 'stranger')).toBe('REQUEST');
    expect(await getSeriesJoinAccess(p, series(), 'member')).toBe('FULL');
    expect(await getSeriesJoinAccess(p, series(), 'org')).toBe('FULL');
    expect(await getSeriesJoinAccess(p, series(), 'stranger', { isAdmin: true })).toBe('FULL');
  });

  test('a normal group still lets anyone join directly', async () => {
    expect(await getSeriesJoinAccess(prismaWith(), series({ membersOnlyPriority: false }), 'stranger')).toBe('FULL');
  });

  test('friends-only + priority: friends no longer skip approval, BLOCKED stays blocked', async () => {
    const p = prismaWith();
    expect(await getSeriesJoinAccess(p, series({ isFriendsOnly: true }), 'friend')).toBe('REQUEST');
    expect(await getSeriesJoinAccess(p, series({ isFriendsOnly: true, friendsOnlyLinkPolicy: 'BLOCKED' }), 'stranger')).toBe('NONE');
  });
});

describe('welcome message per audience', () => {
  const g = { membersOnlyPriority: true, welcomeMessage: 'members', guestWelcomeMessage: 'guests' };
  test('members keep the existing message, guests get their own', () => {
    expect(pickWelcomeMessage(g, true)).toBe('members');
    expect(pickWelcomeMessage(g, false)).toBe('guests');
  });
  test('guest falls back to the shared message when no guest message is set', () => {
    expect(pickWelcomeMessage({ ...g, guestWelcomeMessage: null }, false)).toBe('members');
  });
  test('without priority everyone gets the normal message', () => {
    expect(pickWelcomeMessage({ ...g, membersOnlyPriority: false }, false)).toBe('members');
  });
});
