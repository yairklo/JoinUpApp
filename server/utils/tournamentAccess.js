// Who may create / manage / score / view a tournament. Pure helpers plus one DB lookup, so route
// and service code never re-derives role rules (see docs/plans/2026-10-feature-tournaments.md).
const { parseAdminAllowlist } = require('./admin');

const TOURNAMENT_ROLE_LEVEL = Object.freeze({ SCOREKEEPER: 1, MANAGER: 2, ORGANIZER: 3 });

function parseCreatorAllowlist(raw = process.env.TOURNAMENT_CREATOR_IDS) {
  return parseAdminAllowlist(raw);
}

/** Admin or listed in TOURNAMENT_CREATOR_IDS. The single gate; later a per-user flag can join here. */
function canCreateTournament(user) {
  if (!user || !user.id) return false;
  if (user.isAdmin) return true;
  return parseCreatorAllowlist().includes(String(user.id));
}

function roleLevel(role) {
  return TOURNAMENT_ROLE_LEVEL[role] || 0;
}

/**
 * Effective role of `user` on a tournament: ORGANIZER (owner, ORGANIZER row or site admin),
 * MANAGER, SCOREKEEPER or null. `db` is prisma or a tx client.
 */
async function getTournamentRole(db, tournament, user) {
  if (!tournament || !user || !user.id) return null;
  if (user.isAdmin || tournament.organizerId === user.id) return 'ORGANIZER';
  const row = await db.tournamentRole.findUnique({
    where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
    select: { role: true },
  });
  return row ? row.role : null;
}

const hasRoleAtLeast = (role, min) => roleLevel(role) >= roleLevel(min);

/** DRAFT is visible to roles only; non-public tournaments to roles and team members only. */
async function canViewTournament(db, tournament, user, role) {
  if (!tournament) return false;
  const effectiveRole = role === undefined ? await getTournamentRole(db, tournament, user) : role;
  if (effectiveRole) return true;
  if (tournament.status === 'DRAFT') return false;
  if (tournament.isPublic) return true;
  if (!user || !user.id) return false;
  // Not findUnique: a player may hold several INVITED rows; only ACCEPTED is unique.
  const member = await db.tournamentTeamMember.findFirst({
    where: { tournamentId: tournament.id, userId: user.id, status: { in: ['INVITED', 'ACCEPTED'] } },
    select: { status: true },
  });
  return !!member;
}

module.exports = {
  TOURNAMENT_ROLE_LEVEL,
  parseCreatorAllowlist,
  canCreateTournament,
  roleLevel,
  hasRoleAtLeast,
  getTournamentRole,
  canViewTournament,
};
