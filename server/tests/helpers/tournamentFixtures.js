const { prisma } = require('../../lib/prisma');

async function ensureUsers(ids, extra = {}) {
  for (const id of ids) {
    await prisma.user.upsert({
      where: { id },
      update: extra[id] || {},
      create: { id, name: id, imageUrl: null, ...(extra[id] || {}) },
    });
  }
}

function tournamentBody(over = {}) {
  return {
    title: 'Test Cup',
    sport: 'SOCCER',
    format: 'LEAGUE',
    startsAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    minTeams: 2,
    maxTeams: 4,
    startersPerTeam: 2,
    minPlayersPerTeam: 2,
    maxPlayersPerTeam: 3,
    requireApproval: true,
    ...over,
  };
}

/** Deletes everything a test created, keyed by the user-id prefix it used. */
async function cleanup(prefix) {
  const ts = await prisma.tournament.findMany({ where: { organizerId: { startsWith: prefix } }, select: { id: true } });
  const ids = ts.map((t) => t.id);
  if (ids.length) {
    await prisma.chatRoom.deleteMany({ where: { id: { in: ids } } });
    await prisma.tournament.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.notification.deleteMany({ where: { userId: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: prefix } } });
}

module.exports = { prisma, ensureUsers, tournamentBody, cleanup };
