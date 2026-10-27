// Feature gate for tournaments: until the admin flips `tournamentsPublic`, only admins, tournament
// creators and anyone holding a TournamentRole may see the feature at all.
const { prisma } = require('../lib/prisma');
const { getSetting } = require('./appSettings');
const { canCreateTournament, parseCreatorAllowlist, canViewTournament } = require('./tournamentAccess');
const { parseAdminAllowlist } = require('./admin');
const { attachOptionalUser } = require('./auth');

const SETTING_KEY = 'tournamentsPublic';

// Fail closed: if the setting cannot be read (e.g. migration not applied yet) tournaments stay hidden,
// but /capabilities and the other callers keep answering instead of returning 500.
const isTournamentsPublic = async () => {
  try {
    return (await getSetting(SETTING_KEY, false)) === true;
  } catch (e) {
    console.error('[tournamentsGate] cannot read tournamentsPublic, treating as off:', e && e.message);
    return false;
  }
};

/** isAdmin || canCreateTournament || holds any TournamentRole || tournamentsPublic. */
async function canViewTournaments(user) {
  if (await isTournamentsPublic()) return true;
  if (!user || !user.id) return false;
  if (user.isAdmin || canCreateTournament(user)) return true;
  const role = await prisma.tournamentRole.findFirst({ where: { userId: user.id }, select: { id: true } });
  return !!role;
}

/** Socket `joinTournament`: feature gate first, then the per-tournament visibility rule. */
async function canJoinTournamentRoom(viewer, tournamentId) {
  if (!(await canViewTournaments(viewer))) return false;
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  return !!t && (await canViewTournament(prisma, t, viewer));
}

/**
 * Same rule for bare user ids (notification recipients). Env allowlists and TournamentRole rows are
 * checked in bulk; Clerk-metadata admins need a (cached) Clerk lookup for the remaining ids.
 */
async function filterViewableUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length || (await isTournamentsPublic())) return ids;
  const allowed = new Set([...parseAdminAllowlist(), ...parseCreatorAllowlist()]);
  const rest = ids.filter((id) => !allowed.has(String(id)));
  if (rest.length) {
    const rows = await prisma.tournamentRole.findMany({ where: { userId: { in: rest } }, select: { userId: true } });
    rows.forEach((r) => allowed.add(r.userId));
    const unknown = rest.filter((id) => !allowed.has(String(id)));
    if (unknown.length) {
      const { getClerkUserCached } = require('./auth');
      const { resolveIsAdmin } = require('./admin');
      await Promise.all(unknown.map(async (id) => {
        try {
          if (resolveIsAdmin(id, await getClerkUserCached(id))) allowed.add(String(id));
        } catch { /* lookup failed: not an admin as far as we can tell */ }
      }));
    }
  }
  return ids.filter((id) => allowed.has(String(id)));
}

/**
 * After the switch is turned off: sockets already in a `tournament:*` room keep receiving updates
 * unless removed. Re-checks every such socket (across instances) and drops the ones now outside.
 */
async function evictUnauthorizedTournamentSockets(io) {
  if (!io || typeof io.fetchSockets !== 'function') return 0;
  let evicted = 0;
  for (const s of await io.fetchSockets()) {
    const rooms = [...s.rooms].filter((r) => r.startsWith('tournament:'));
    if (!rooms.length) continue;
    const viewer = s.data && s.data.userId ? { id: s.data.userId, isAdmin: !!s.data.isAdmin } : null;
    for (const room of rooms) {
      if (!(await canJoinTournamentRoom(viewer, room.slice('tournament:'.length)))) {
        s.leave(room);
        evicted += 1;
      }
    }
  }
  return evicted;
}

/** Mounted in front of every tournaments route. Public -> unchanged; else 401 guest / 404 outsider. */
async function tournamentsGate(req, res, next) {
  try {
    if (await isTournamentsPublic()) return next();
    await new Promise((resolve) => attachOptionalUser(req, res, resolve));
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (await canViewTournaments(req.user)) return next();
    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('[tournamentsGate]', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { SETTING_KEY, isTournamentsPublic, canViewTournaments, canJoinTournamentRoom, evictUnauthorizedTournamentSockets, filterViewableUserIds, tournamentsGate };
