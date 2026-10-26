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

/** Creates `n` APPROVED teams with `players` accepted members each; returns team rows in order. */
async function seedTeams(prefix, tournamentId, n, players = 2) {
  const teams = [];
  for (let i = 1; i <= n; i += 1) {
    const ids = Array.from({ length: players }, (_, j) => `${prefix}s${i}p${j + 1}`);
    await ensureUsers(ids);
    const team = await prisma.tournamentTeam.create({
      data: {
        tournamentId, name: `Seed ${String(i).padStart(2, '0')}`, captainId: ids[0], status: 'APPROVED',
        joinCode: `${tournamentId.slice(-6)}-${prefix}${i}`,
        members: { create: ids.map((userId, j) => ({ tournamentId, userId, role: j === 0 ? 'CAPTAIN' : 'PLAYER', status: 'ACCEPTED' })) },
      },
    });
    teams.push({ ...team, playerIds: ids });
  }
  return teams;
}

/** Tournaments are admin-gated by default (tournamentsPublic=false); feature tests run with them open. */
async function openTournaments() {
  await prisma.appSetting.upsert({
    where: { key: 'tournamentsPublic' },
    update: { value: true },
    create: { key: 'tournamentsPublic', value: true },
  });
}

module.exports = {
  openTournaments, seedTeams, prisma, ensureUsers, tournamentBody, cleanup };
