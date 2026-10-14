// DB-backed: daily city-game digest — hour matching, idempotent claim, filters.
jest.setTimeout(60000);

const { prisma } = require('../lib/prisma');
const { sendDigests } = require('../workers/notificationDigestWorker');

const P = 'ndw_test_';
const CITY = 'עירבדיקה_סיכום_ndw';
const ids = { digest: `${P}digest`, organizer: `${P}org`, friendOrg: `${P}friendorg` };
const allIds = Object.values(ids);
// 05:00Z = 08:00 Asia/Jerusalem in October (IDT)
const AT_8_LOCAL = new Date('2030-10-14T05:05:00Z');

describe('notification digest worker', () => {
  let field;
  const fakeService = { sendPushOnly: jest.fn().mockResolvedValue() };

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of allIds) {
      await prisma.user.upsert({ where: { id }, update: { city: CITY }, create: { id, name: id, city: CITY } });
    }
    const [a, b] = [ids.digest, ids.friendOrg].sort();
    await prisma.friendship.create({ data: { userAId: a, userBId: b } }).catch(() => {});
    field = await prisma.field.create({
      data: { name: 'מגרש ndw', location: 'רחוב 1', city: CITY, price: 0, rating: 5, available: false, type: 'OPEN' },
    });
    const start = new Date(AT_8_LOCAL.getTime() + 2 * 86400000);
    const createdAt = new Date(AT_8_LOCAL.getTime() - 3600000);
    await prisma.game.createMany({
      data: [
        { fieldId: field.id, start, maxPlayers: 10, organizerId: ids.organizer, sport: 'SOCCER', createdAt },
        { fieldId: field.id, start, maxPlayers: 10, organizerId: ids.organizer, sport: 'BASKETBALL', createdAt },
        { fieldId: field.id, start, maxPlayers: 10, organizerId: ids.organizer, sport: 'SOCCER', createdAt, isFriendsOnly: true },
        { fieldId: field.id, start, maxPlayers: 10, organizerId: ids.friendOrg, sport: 'SOCCER', createdAt },
      ],
    });
  });

  afterAll(async () => {
    await prisma.game.deleteMany({ where: { fieldId: field.id } });
    await prisma.field.delete({ where: { id: field.id } });
    await prisma.userNotificationSettings.deleteMany({ where: { userId: { in: allIds } } });
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: { in: allIds } }, { userBId: { in: allIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: allIds } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    fakeService.sendPushOnly.mockClear();
    await prisma.userNotificationSettings.upsert({
      where: { userId: ids.digest },
      create: { userId: ids.digest, cityGamesPush: true, cityGamesDigest: true, cityGamesSports: ['SOCCER'] },
      update: { cityGamesPush: true, cityGamesDigest: true, cityGamesSports: ['SOCCER'], lastDigestAt: null, digestHour: 8 },
    });
  });

  test('wrong local hour: nothing sent, nothing claimed', async () => {
    await sendDigests({ prisma, notificationService: fakeService, now: new Date('2030-10-14T09:00:00Z') });
    expect(fakeService.sendPushOnly).not.toHaveBeenCalled();
    const s = await prisma.userNotificationSettings.findUnique({ where: { userId: ids.digest } });
    expect(s.lastDigestAt).toBeNull();
  });

  test('at digest hour: one summary counting only public, matching-sport, non-friend games', async () => {
    await sendDigests({ prisma, notificationService: fakeService, now: AT_8_LOCAL });
    const mine = fakeService.sendPushOnly.mock.calls.filter(c => c[0] === ids.digest);
    expect(mine).toHaveLength(1);
    expect(mine[0][1]).toBe('NEW_GAME_IN_CITY');
    expect(mine[0][4]).toMatchObject({ digest: true, count: '1' });
  });

  test('concurrent runs send once (claim is idempotent)', async () => {
    await Promise.all([
      sendDigests({ prisma, notificationService: fakeService, now: AT_8_LOCAL }),
      sendDigests({ prisma, notificationService: fakeService, now: AT_8_LOCAL }),
    ]);
    expect(fakeService.sendPushOnly.mock.calls.filter(c => c[0] === ids.digest)).toHaveLength(1);
    await sendDigests({ prisma, notificationService: fakeService, now: new Date(AT_8_LOCAL.getTime() + 600000) });
    expect(fakeService.sendPushOnly.mock.calls.filter(c => c[0] === ids.digest)).toHaveLength(1);
  });

  test('no matching games: claimed but no push', async () => {
    await prisma.userNotificationSettings.update({ where: { userId: ids.digest }, data: { cityGamesSports: ['TENNIS'] } });
    await sendDigests({ prisma, notificationService: fakeService, now: AT_8_LOCAL });
    expect(fakeService.sendPushOnly.mock.calls.filter(c => c[0] === ids.digest)).toHaveLength(0);
  });
});
