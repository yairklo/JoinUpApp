const cron = require('node-cron');
const { prisma: defaultPrisma } = require('../lib/prisma');
const { NotificationService } = require('../services/notificationService');
const { prismaFieldCityFilter } = require('../utils/cityAliases');
const { localMinutes, isMuteActive } = require('../utils/notificationPrefs');

/**
 * Daily "new games in your city" summary for users who chose digest mode instead of an instant
 * push per game. Runs every 15 minutes; each user is handled once a day, at their digestHour in
 * their own timezone. The lastDigestAt claim (updateMany) makes a second instance a no-op.
 */

const MIN_GAP_MS = 20 * 60 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

async function countDigestGames(prisma, { userId, userCity, settings, since, now }) {
  const cities = settings.cityGamesCities?.length ? settings.cityGamesCities : (userCity ? [userCity] : []);
  if (cities.length === 0) return { count: 0, city: null };

  const [friendRows, mutes] = await Promise.all([
    prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    }),
    prisma.notificationMute.findMany({ where: { userId, targetType: 'USER' } }),
  ]);
  // Friends' games already arrived as FRIEND_NEW_GAME; muted organizers are left out.
  const excludedOrganizers = [
    userId,
    ...friendRows.map(f => (f.userAId === userId ? f.userBId : f.userAId)),
    ...mutes.filter(m => isMuteActive(m, now)).map(m => m.targetId),
  ];

  const count = await prisma.game.count({
    where: {
      createdAt: { gt: since },
      start: { gt: now },
      status: 'OPEN',
      organizerId: { notIn: excludedOrganizers },
      ...(settings.cityGamesSports?.length ? { sport: { in: settings.cityGamesSports } } : {}),
      AND: [
        { OR: [{ isFriendsOnly: false }, { friendsOnlyUntil: { lte: now } }] },
        { field: { OR: cities.map(c => prismaFieldCityFilter(c)) } },
      ],
    },
  });
  return { count, city: cities.length === 1 ? cities[0] : null };
}

async function sendDigests({ prisma = defaultPrisma, notificationService, now = new Date() } = {}) {
  const service = notificationService || new NotificationService(prisma);
  const cutoff = new Date(now.getTime() - MIN_GAP_MS);
  const candidates = await prisma.userNotificationSettings.findMany({
    where: {
      cityGamesDigest: true,
      cityGamesPush: true,
      pushEnabled: true,
      OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: cutoff } }],
    },
    include: { user: { select: { city: true } } },
  });

  let sent = 0;
  for (const settings of candidates) {
    try {
      const hour = Math.floor(localMinutes(now, settings.timezone) / 60);
      if (hour !== settings.digestHour) continue;

      const claimed = await prisma.userNotificationSettings.updateMany({
        where: { userId: settings.userId, OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: cutoff } }] },
        data: { lastDigestAt: now },
      });
      if (claimed.count === 0) continue; // another instance took it

      const since = settings.lastDigestAt && now.getTime() - settings.lastDigestAt.getTime() < 2 * LOOKBACK_MS
        ? settings.lastDigestAt
        : new Date(now.getTime() - LOOKBACK_MS);
      const { count, city } = await countDigestGames(prisma, {
        userId: settings.userId, userCity: settings.user?.city, settings, since, now,
      });
      if (count === 0) continue;

      const where = city ? `ב${city}` : 'באזורים שבחרת';
      const whereEn = city ? `in ${city}` : 'in your areas';
      await service.sendPushOnly(
        settings.userId,
        'NEW_GAME_IN_CITY',
        count === 1 ? `משחק חדש ${where}` : `${count} משחקים חדשים ${where}`,
        'היכנסו לראות ולהצטרף',
        {
          digest: true,
          count: String(count),
          link: '/games',
          titleEn: count === 1 ? `1 new game ${whereEn}` : `${count} new games ${whereEn}`,
          bodyEn: 'Tap to see them and join',
        }
      );
      sent++;
    } catch (error) {
      console.error(`[DIGEST_WORKER] Failed for ${settings.userId}:`, error);
    }
  }
  if (sent) console.log(`[DIGEST_WORKER] Sent ${sent} city-game digest(s)`);
  return sent;
}

function startNotificationDigestWorker({ notificationService } = {}) {
  cron.schedule('*/15 * * * *', () => {
    sendDigests({ notificationService }).catch(err => console.error('[DIGEST_WORKER] Cron execution failed:', err));
  });
  console.log('[DIGEST_WORKER] Scheduled every 15 minutes');
}

module.exports = { startNotificationDigestWorker, sendDigests, countDigestGames };
