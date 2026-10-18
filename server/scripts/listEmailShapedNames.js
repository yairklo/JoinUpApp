/**
 * Lists User rows whose name is email-shaped (leftovers of the old Clerk name overwrite).
 * Dry-run by default; pass --apply to null those names (they are then refilled from Clerk on the
 * user's next authenticated write, if Clerk has a real name). Idempotent.
 * Usage: node scripts/listEmailShapedNames.js [--apply]
 */
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  const apply = process.argv.includes('--apply');
  try {
    const rows = await prisma.user.findMany({
      where: { name: { contains: '@' } },
      select: { id: true, name: true },
    });
    console.log(`${rows.length} user(s) with email-shaped name`);
    rows.forEach((r) => console.log(r.id, r.name));
    if (!apply) {
      console.log('dry run (use --apply to null them)');
    } else if (rows.length) {
      const { count } = await prisma.user.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, name: { contains: '@' } },
        data: { name: null },
      });
      console.log(`nulled ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
})();
