/**
 * Read-only: why would a user not get an in-app friend-request notification (Q-05)?
 * Prints the user's notification settings and active mutes, and the decision the server would make
 * for a FRIEND_REQUEST from the given sender. Usage:
 *   node scripts/diagnoseNotifications.js <receiverUserId> [senderUserId]
 */
const { PrismaClient } = require('@prisma/client');
const { decideDelivery } = require('../utils/notificationPrefs');

(async () => {
  const [receiverId, senderId] = process.argv.slice(2);
  if (!receiverId) {
    console.error('usage: node scripts/diagnoseNotifications.js <receiverUserId> [senderUserId]');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const [settings, mutes, recent] = await Promise.all([
      prisma.userNotificationSettings.findUnique({ where: { userId: receiverId } }),
      prisma.notificationMute.findMany({ where: { userId: receiverId } }),
      prisma.notification.findMany({
        where: { userId: receiverId, type: 'FRIEND_REQUEST' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, read: true },
      }),
    ]);
    console.log('settings row:', settings ? JSON.stringify(settings) : '(none: defaults apply, in-app on)');
    console.log('mutes:', JSON.stringify(mutes));
    console.log('last FRIEND_REQUEST notifications:', JSON.stringify(recent));
    const active = mutes.filter((m) => !m.until || new Date(m.until) > new Date());
    const decision = decideDelivery({
      settings,
      mutes: active,
      type: 'FRIEND_REQUEST',
      ctx: senderId ? { actorId: senderId } : {},
    });
    console.log('decision for a FRIEND_REQUEST:', JSON.stringify(decision));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
