/**
 * One-off data fix for Q-01. Before the markAsRead fix, opening a chat flipped moderated
 * (status 'blocked') messages to 'read', which made them visible to the recipient. Every blocked
 * attempt left a FlaggedMessage row (aiTriggers.source = 'blocked_attempt') with the sender, text
 * and room, so the affected messages can be found again: same sender + room + text, created
 * within a short window after the flag, currently 'read'. Those are put back to 'blocked'.
 *
 * Dry-run by default. Idempotent. Usage: node scripts/restoreBlockedMessages.js [--apply]
 */
const WINDOW_BEFORE_MS = 5 * 1000;
const WINDOW_AFTER_MS = 2 * 60 * 1000;

async function restoreBlockedMessages(prisma, { apply = false } = {}) {
  const flags = await prisma.flaggedMessage.findMany({
    where: { aiTriggers: { path: ['source'], equals: 'blocked_attempt' } },
    select: { id: true, content: true, userId: true, createdAt: true, aiTriggers: true },
  });

  const toRestore = [];
  for (const flag of flags) {
    const roomId = flag.aiTriggers && flag.aiTriggers.roomId;
    if (!roomId || !flag.content || !flag.userId) continue;
    const rows = await prisma.message.findMany({
      where: {
        chatRoomId: String(roomId),
        userId: flag.userId,
        text: flag.content,
        status: { notIn: ['blocked', 'rejected'] },
        isDeleted: false,
        createdAt: {
          gte: new Date(flag.createdAt.getTime() - WINDOW_BEFORE_MS),
          lte: new Date(flag.createdAt.getTime() + WINDOW_AFTER_MS),
        },
      },
      select: { id: true },
    });
    rows.forEach((r) => toRestore.push(r.id));
  }

  const ids = [...new Set(toRestore)];
  let restored = 0;
  if (apply && ids.length) {
    const res = await prisma.message.updateMany({ where: { id: { in: ids } }, data: { status: 'blocked' } });
    restored = res.count;
  }
  return { flags: flags.length, matched: ids.length, restored, ids };
}

module.exports = { restoreBlockedMessages };

if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  (async () => {
    const prisma = new PrismaClient();
    const apply = process.argv.includes('--apply');
    try {
      const result = await restoreBlockedMessages(prisma, { apply });
      console.log(`${result.flags} blocked attempt(s) on record, ${result.matched} visible message(s) matched`);
      if (!apply) console.log('dry run (use --apply to set them back to blocked)');
      else console.log(`restored ${result.restored}`);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
