// Feature gate for tournaments: until the admin flips `tournamentsPublic`, only admins, tournament
// creators and anyone holding a TournamentRole may see the feature at all.
const { prisma } = require('../lib/prisma');
const { getSetting } = require('./appSettings');
const { canCreateTournament, parseCreatorAllowlist, canViewTournament } = require('./tournamentAccess');
const { parseAdminAllowlist } = require('./admin');
const { attachOptionalUser } = require('./auth');

const SETTING_KEY = 'tournamentsPublic';

const isTournamentsPublic = async () => (await getSetting(SETTING_KEY, false)) === true;

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
 * Same rule for bare user ids (notification recipients). Admin status granted via Clerk metadata
 * is unknown here, so only the env allowlists count; admins are never team recipients in practice.
 */
async function filterViewableUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length || (await isTournamentsPublic())) return ids;
  const allowed = new Set([...parseAdminAllowlist(), ...parseCreatorAllowlist()]);
  const rest = ids.filter((id) => !allowed.has(String(id)));
  if (rest.length) {
    const rows = await prisma.tournamentRole.findMany({ where: { userId: { in: rest } }, select: { userId: true } });
    rows.forEach((r) => allowed.add(r.userId));
  }
  return ids.filter((id) => allowed.has(String(id)));
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

module.exports = { SETTING_KEY, isTournamentsPublic, canViewTournaments, canJoinTournamentRoom, filterViewableUserIds, tournamentsGate };
