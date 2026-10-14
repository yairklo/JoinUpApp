// DB-backed: who gets notified when a game is created (friends vs. city, filters, mutes,
// friends-only privacy). Uses a city name no real user has, so the fan-out stays inside fixtures.
jest.setTimeout(60000);

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));

const { prisma, notificationService, notifyNetworkOfNewGame, notifyFriendsOfJoin } = require('../services/gameService');

const P = 'gcn_test_';
const CITY = 'עירבדיקה_התראות_gcn';
const OTHER_CITY = 'עירבדיקה_אחרת_gcn';
const ids = {
  creator: `${P}creator`,
  friend: `${P}friend`,
  city: `${P}city`,
  tennisOnly: `${P}tennis`,
  remote: `${P}remote`,
  noInApp: `${P}noinapp`,
  muter: `${P}muter`,
  joiner: `${P}joiner`,
};
const allIds = Object.values(ids);

const fakeGame = (over = {}) => ({
  id: `${P}game_${Math.random().toString(36).slice(2, 8)}`,
  title: 'gcn game',
  sport: 'SOCCER',
  start: new Date(Date.now() + 3 * 86400000),
  isFriendsOnly: false,
  friendsOnlyUntil: null,
  organizerId: ids.creator,
  field: { name: 'מגרש gcn', city: CITY, location: 'רחוב 1' },
  ...over,
});

async function notificationsFor(gameId) {
  const rows = await prisma.notification.findMany({ where: { userId: { in: allIds } } });
  return rows.filter(r => r.data?.gameId === gameId).map(r => ({ userId: r.userId, type: r.type }));
}

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

describe('game-created notification fan-out', () => {
  beforeAll(async () => {
    await prisma.$connect();
    const city = { [ids.creator]: CITY, [ids.friend]: CITY, [ids.city]: CITY, [ids.tennisOnly]: CITY, [ids.remote]: OTHER_CITY, [ids.noInApp]: CITY, [ids.muter]: CITY, [ids.joiner]: OTHER_CITY };
    for (const id of allIds) {
      await prisma.user.upsert({ where: { id }, update: { city: city[id] }, create: { id, name: id, city: city[id] } });
    }
    await prisma.userNotificationSettings.createMany({
      data: [
        { userId: ids.tennisOnly, cityGamesSports: ['TENNIS'] },
        { userId: ids.remote, cityGamesCities: [CITY] },
        { userId: ids.noInApp, cityGamesInApp: false },
        { userId: ids.friend, friendJoinsInApp: true },
      ],
      skipDuplicates: true,
    });
    await prisma.notificationMute.create({ data: { userId: ids.muter, targetType: 'USER', targetId: ids.creator } });
    for (const [a, b] of [pair(ids.creator, ids.friend), pair(ids.joiner, ids.friend)]) {
      await prisma.friendship.create({ data: { userAId: a, userBId: b } }).catch(() => {});
    }
    jest.spyOn(notificationService, 'sendPushToAllDevices').mockResolvedValue();
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.notificationMute.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.userNotificationSettings.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: allIds } }, { userBId: { in: allIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: allIds } } });
    await prisma.$disconnect();
  });

  test('public game: friend gets FRIEND_NEW_GAME, city users per filters get NEW_GAME_IN_CITY', async () => {
    const game = fakeGame();
    await notifyNetworkOfNewGame(game, { id: ids.creator, name: 'Creator' }, null);
    const got = await notificationsFor(game.id);

    expect(got).toContainEqual({ userId: ids.friend, type: 'FRIEND_NEW_GAME' });
    expect(got.filter(n => n.userId === ids.friend)).toHaveLength(1); // not also the city one
    expect(got).toContainEqual({ userId: ids.city, type: 'NEW_GAME_IN_CITY' });
    expect(got).toContainEqual({ userId: ids.remote, type: 'NEW_GAME_IN_CITY' }); // opted into the city
    const nobody = [ids.creator, ids.tennisOnly, ids.noInApp, ids.muter, ids.joiner];
    for (const id of nobody) expect(got.find(n => n.userId === id)).toBeUndefined();
  });

  test('sport filter lets a matching sport through', async () => {
    const game = fakeGame({ sport: 'TENNIS' });
    await notifyNetworkOfNewGame(game, { id: ids.creator, name: 'Creator' }, null);
    const got = await notificationsFor(game.id);
    expect(got).toContainEqual({ userId: ids.tennisOnly, type: 'NEW_GAME_IN_CITY' });
  });

  test('friends-only game is never announced to the city', async () => {
    const game = fakeGame({ isFriendsOnly: true, friendsOnlyUntil: new Date(Date.now() + 86400000) });
    await notifyNetworkOfNewGame(game, { id: ids.creator, name: 'Creator' }, null);
    const got = await notificationsFor(game.id);
    expect(got).toEqual([{ userId: ids.friend, type: 'FRIEND_NEW_GAME' }]);
  });

  test('includeCity:false (group games) only tells friends', async () => {
    const game = fakeGame();
    await notifyNetworkOfNewGame(game, { id: ids.creator, name: 'Creator' }, null, { includeCity: false });
    const got = await notificationsFor(game.id);
    expect(got).toEqual([{ userId: ids.friend, type: 'FRIEND_NEW_GAME' }]);
  });

  test('friend joining: only opted-in friends hear, organizer excluded', async () => {
    const game = fakeGame({ id: `${P}game_join`, organizerId: ids.city });
    await notifyFriendsOfJoin(game, { id: ids.joiner, name: 'Joiner' }, null);
    const got = await notificationsFor(game.id);
    expect(got).toEqual([{ userId: ids.friend, type: 'FRIEND_JOINED_GAME' }]);
  });
});
