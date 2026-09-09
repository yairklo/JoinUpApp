/**
 * Find / merge duplicate User rows (same person, two Clerk IDs — e.g. pre- vs
 * post-Clerk Production). Dry-run by default.
 *
 * List likely duplicates:
 *   node scripts/merge-duplicate-users.js
 *
 * Merge DROP into KEEP (reassign FKs, then delete DROP):
 *   node scripts/merge-duplicate-users.js --from user_OLD --to user_NEW --execute
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function listDuplicates() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byName = new Map();
  for (const u of users) {
    const key = (u.name || "").trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(u);
  }

  const groups = [...byName.entries()].filter(([, list]) => list.length > 1);
  if (groups.length === 0) {
    console.log("No duplicate names found.");
    return;
  }
  console.log("Users sharing a display name (inspect Clerk IDs before merging):\n");
  for (const [name, list] of groups) {
    console.log(`— ${name}`);
    for (const u of list) {
      console.log(`    ${u.id}  email=${u.email || "—"}  created=${u.createdAt.toISOString()}`);
    }
    console.log("");
  }
}

async function reassign(fromId, toId, execute) {
  if (fromId === toId) {
    throw new Error("--from and --to must be different");
  }
  const [from, to] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromId } }),
    prisma.user.findUnique({ where: { id: toId } }),
  ]);
  if (!from) throw new Error(`--from user not found: ${fromId}`);
  if (!to) throw new Error(`--to user not found: ${toId}`);

  const counts = {
    games: await prisma.game.count({ where: { organizerId: fromId } }),
    series: await prisma.gameSeries.count({ where: { organizerId: fromId } }),
    participations: await prisma.participation.count({ where: { userId: fromId } }),
    roles: await prisma.gameRole.count({ where: { userId: fromId } }),
  };
  console.log(`Would move organizer/participation/role rows from ${fromId} (${from.name}) → ${toId} (${to.name}):`, counts);
  if (!execute) {
    console.log("Dry run. Re-run with --execute to apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.game.updateMany({ where: { organizerId: fromId }, data: { organizerId: toId } });
    await tx.gameSeries.updateMany({ where: { organizerId: fromId }, data: { organizerId: toId } });

    const dropParts = await tx.participation.findMany({ where: { userId: fromId } });
    for (const p of dropParts) {
      const clash = await tx.participation.findUnique({
        where: { gameId_userId: { gameId: p.gameId, userId: toId } },
      });
      if (clash) await tx.participation.delete({ where: { id: p.id } });
      else await tx.participation.update({ where: { id: p.id }, data: { userId: toId } });
    }

    const dropRoles = await tx.gameRole.findMany({ where: { userId: fromId } });
    for (const r of dropRoles) {
      const clash = await tx.gameRole.findUnique({
        where: { gameId_userId: { gameId: r.gameId, userId: toId } },
      });
      if (clash) await tx.gameRole.delete({ where: { id: r.id } });
      else await tx.gameRole.update({ where: { id: r.id }, data: { userId: toId } });
    }

    await tx.user.delete({ where: { id: fromId } });
  });
  console.log("Merge complete. Remaining Clerk/user-row cleanup (chat, friends, ratings) may still reference the old id if FK update wasn't covered — inspect before deleting leftovers.");
}

async function main() {
  const fromId = arg("--from");
  const toId = arg("--to");
  const execute = process.argv.includes("--execute");
  if (fromId && toId) {
    await reassign(fromId, toId, execute);
  } else {
    await listDuplicates();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
