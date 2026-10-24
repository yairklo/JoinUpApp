// Teams, rosters, invites, join codes, approval and waitlist.
// Every roster-changing write runs in one interactive transaction that first locks the tournament
// row (lockTournament), so "last spot", "one ACCEPTED team per player" and roster max are
// race-free even though Prisma cannot express them as constraints.
const crypto = require('crypto');
const { prisma, TournamentError, lockTournament, loadTournament, loadForViewer } = require('./tournamentService');
const results = require('./tournamentResultService');
const { canAddMember, validateRoster } = require('../shared/tournament/rosterRules');
const { getAgeInJerusalem, ADULT_AGE } = require('../shared/ageGate');
const { publicDisplayName } = require('../utils/publicName');
const { getTournamentRole, hasRoleAtLeast } = require('../utils/tournamentAccess');

const HELD = ['APPROVED', 'PENDING']; // statuses that occupy one of the maxTeams spots
const DEAD_TEAM = ['REJECTED', 'WITHDRAWN'];
const FINISHED_TOURNAMENT = ['COMPLETED', 'CANCELLED'];

const err = (status, code, message, extra) => new TournamentError(status, code, message, extra);
const rulesOf = (t) => ({
  minPlayers: t.minPlayersPerTeam,
  maxPlayers: t.maxPlayersPerTeam,
  startersPerTeam: t.startersPerTeam,
  allowMinors: !!t.openToMinors,
});

const newJoinCode = () => crypto.randomBytes(6).toString('base64url');

function registrationWindowOpen(t, now = new Date()) {
  return t.status === 'REGISTRATION_OPEN'
    && (!t.registrationOpensAt || t.registrationOpensAt <= now)
    && (!t.registrationClosesAt || t.registrationClosesAt >= now);
}

/** Roster edits: managers until the end; everyone else while registration is live and unlocked. */
function assertRosterEditable(t, role, now = new Date()) {
  if (FINISHED_TOURNAMENT.includes(t.status)) throw err(409, 'TOURNAMENT_CLOSED', 'Tournament is finished');
  if (hasRoleAtLeast(role, 'MANAGER')) return;
  if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(t.status)) {
    throw err(409, 'ROSTER_LOCKED', 'Rosters can no longer be changed');
  }
  if (t.rosterLockAt && t.rosterLockAt <= now) throw err(409, 'ROSTER_LOCKED', 'The roster lock time has passed');
}

async function isMinor(db, userId) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
  if (!u) throw err(404, 'USER_NOT_FOUND', 'User not found');
  const age = getAgeInJerusalem(u.birthDate);
  return age !== null && age < ADULT_AGE;
}

async function acceptedElsewhere(db, tournamentId, userId, exceptTeamId) {
  const row = await db.tournamentTeamMember.findFirst({
    where: { tournamentId, userId, status: 'ACCEPTED', ...(exceptTeamId ? { teamId: { not: exceptTeamId } } : {}) },
    select: { teamId: true },
  });
  return row ? row.teamId : null;
}

const HTTP_BY_ROSTER_CODE = {
  TOO_MANY_PLAYERS: 409, PLAYER_IN_OTHER_TEAM: 409, DUPLICATE_PLAYER: 409, MINORS_NOT_ALLOWED: 403,
};

function throwRosterError(validation) {
  const first = validation.errors[0];
  throw err(HTTP_BY_ROSTER_CODE[first.code] || 409, first.code, first.message, { errors: validation.errors });
}

/** Checks that `candidate` may be added to `team` (capacity counts ACCEPTED + INVITED rows). */
async function assertCanAdd(tx, t, team, candidate, { captainId }) {
  const members = await tx.tournamentTeamMember.findMany({
    where: { teamId: team.id, status: { in: ['ACCEPTED', 'INVITED'] }, userId: { not: candidate.userId } },
    select: { userId: true },
  });
  const other = await acceptedElsewhere(tx, t.id, candidate.userId, team.id);
  const validation = canAddMember(
    { captainId, members },
    rulesOf(t),
    candidate,
    { enforceMin: false, teamId: team.id, memberships: other ? { [candidate.userId]: other } : {} },
  );
  if (!validation.valid) throwRosterError(validation);
}

async function addToChat(tx, tournamentId, userId) {
  await tx.chatParticipant.createMany({ data: [{ chatId: tournamentId, userId }], skipDuplicates: true });
}

async function voidOtherInvites(tx, tournamentId, userId, keepTeamId) {
  await tx.tournamentTeamMember.deleteMany({
    where: { tournamentId, userId, status: 'INVITED', ...(keepTeamId ? { teamId: { not: keepTeamId } } : {}) },
  });
}

async function loadTeam(db, tournamentId, teamId) {
  const team = await db.tournamentTeam.findFirst({ where: { id: teamId, tournamentId } });
  if (!team) throw err(404, 'TEAM_NOT_FOUND', 'Team not found');
  return team;
}

/** Captain of the team or a manager+; returns the actor's tournament role. */
async function loadTeamActor(db, t, team, user, { requireManager = false } = {}) {
  const role = await getTournamentRole(db, t, user);
  const isManager = hasRoleAtLeast(role, 'MANAGER');
  const isCaptain = !!user && team.captainId === user.id;
  if (!(isManager || (isCaptain && !requireManager))) throw err(403, 'FORBIDDEN', 'Not allowed');
  return { role, isManager, isCaptain };
}

/** Promotes the oldest waitlisted teams into free spots. Returns the promoted team ids. */
async function promoteWaitlist(tx, t, exceptTeamId) {
  const promoted = [];
  for (;;) {
    const held = await tx.tournamentTeam.count({ where: { tournamentId: t.id, status: { in: HELD } } });
    if (held >= t.maxTeams) break;
    const next = await tx.tournamentTeam.findFirst({
      where: { tournamentId: t.id, status: 'WAITLISTED', ...(exceptTeamId ? { id: { not: exceptTeamId } } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!next) break;
    await tx.tournamentTeam.update({ where: { id: next.id }, data: { status: t.requireApproval ? 'PENDING' : 'APPROVED' } });
    promoted.push(next.id);
  }
  return promoted;
}

async function createTeam(user, tournamentId, body) {
  const b = body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 60) throw err(400, 'VALIDATION', 'name is required (max 60 chars)');
  const color = typeof b.color === 'string' ? b.color.slice(0, 20) : null;
  const logoUrl = typeof b.logoUrl === 'string' ? b.logoUrl.slice(0, 1000) : null;
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    if (t.status === 'DRAFT') throw err(404, 'NOT_FOUND', 'Tournament not found');
    if (!registrationWindowOpen(t)) throw err(409, 'REGISTRATION_CLOSED', 'Registration is not open');
    if (await acceptedElsewhere(tx, tournamentId, user.id)) {
      throw err(409, 'PLAYER_IN_OTHER_TEAM', 'You are already on a team in this tournament');
    }
    if (!t.openToMinors && (await isMinor(tx, user.id))) {
      throw err(403, 'MINORS_NOT_ALLOWED', 'This tournament is not open to minors');
    }
    const held = await tx.tournamentTeam.count({ where: { tournamentId, status: { in: HELD } } });
    const status = held >= t.maxTeams ? 'WAITLISTED' : t.requireApproval ? 'PENDING' : 'APPROVED';
    let team;
    try {
      team = await tx.tournamentTeam.create({
        data: { tournamentId, name, color, logoUrl, captainId: user.id, status, joinCode: newJoinCode() },
      });
    } catch (e) {
      if (e.code === 'P2002') throw err(409, 'NAME_TAKEN', 'A team with this name already exists');
      throw e;
    }
    await voidOtherInvites(tx, tournamentId, user.id, null);
    await tx.tournamentTeamMember.create({
      data: { teamId: team.id, tournamentId, userId: user.id, role: 'CAPTAIN', status: 'ACCEPTED' },
    });
    await addToChat(tx, tournamentId, user.id);
    return { team: await serializeTeam(tx, team.id, { canSeeAll: true }), waitlisted: status === 'WAITLISTED' };
  });
}

const memberView = (m) => ({
  userId: m.userId,
  name: publicDisplayName(m.user && m.user.name),
  imageUrl: (m.user && m.user.imageUrl) || null,
  role: m.role,
  status: m.status,
  jerseyNumber: m.jerseyNumber,
});

const TEAM_WITH_MEMBERS = { members: { include: { user: { select: { id: true, name: true, imageUrl: true } } }, orderBy: { createdAt: 'asc' } } };

/** Shapes a team row loaded with TEAM_WITH_MEMBERS. `canSeeAll`: captain / manager view (join code, invited + declined members). */
function shapeTeam(team, { canSeeAll = false } = {}) {
  const members = team.members.filter((m) => (canSeeAll ? m.status !== 'REMOVED' : m.status === 'ACCEPTED'));
  return {
    id: team.id,
    tournamentId: team.tournamentId,
    name: team.name,
    color: team.color,
    logoUrl: team.logoUrl,
    captainId: team.captainId,
    status: team.status,
    seed: team.seed,
    manualRank: team.manualRank,
    groupId: team.groupId,
    memberCount: team.members.filter((m) => m.status === 'ACCEPTED').length,
    ...(canSeeAll ? { joinCode: team.joinCode } : {}),
    members: members.map(memberView),
  };
}

async function serializeTeam(db, teamId, { canSeeAll = false } = {}) {
  const team = await db.tournamentTeam.findUnique({ where: { id: teamId }, include: TEAM_WITH_MEMBERS });
  return shapeTeam(team, { canSeeAll });
}

async function listTeams(user, tournamentId, query = {}) {
  const { tournament, role } = await loadForViewer(prisma, tournamentId, user);
  const isManager = hasRoleAtLeast(role, 'MANAGER');
  const mine = user && user.id
    ? await prisma.tournamentTeamMember.findMany({
        where: { tournamentId, userId: user.id, status: { in: ['ACCEPTED', 'INVITED'] } },
        select: { teamId: true },
      })
    : [];
  const mineIds = new Set(mine.map((m) => m.teamId));
  const where = { tournamentId };
  if (query.status) where.status = { in: String(query.status).split(',') };
  const teams = await prisma.tournamentTeam.findMany({
    where, orderBy: [{ seed: 'asc' }, { createdAt: 'asc' }], include: TEAM_WITH_MEMBERS,
  });
  const out = teams
    .filter((tm) => isManager || tm.status === 'APPROVED' || mineIds.has(tm.id))
    .map((tm) => {
      const canSeeAll = isManager || (!!user && tm.captainId === user.id);
      return { ...shapeTeam(tm, { canSeeAll }), isMine: mineIds.has(tm.id) };
    });
  return { tournamentId: tournament.id, teams: out };
}

async function getTeam(user, tournamentId, teamId) {
  const { role } = await loadForViewer(prisma, tournamentId, user);
  const team = await loadTeam(prisma, tournamentId, teamId);
  const isManager = hasRoleAtLeast(role, 'MANAGER');
  const isCaptain = !!user && team.captainId === user.id;
  const isMember = !!user && !!(await prisma.tournamentTeamMember.findFirst({
    where: { teamId, userId: user.id, status: { in: ['ACCEPTED', 'INVITED'] } },
  }));
  if (!isManager && !isMember && team.status !== 'APPROVED') throw err(404, 'TEAM_NOT_FOUND', 'Team not found');
  return serializeTeam(prisma, teamId, { canSeeAll: isManager || isCaptain });
}

async function updateTeam(user, tournamentId, teamId, body) {
  const b = body || {};
  const t = await loadTournament(prisma, tournamentId);
  const team = await loadTeam(prisma, tournamentId, teamId);
  const { role, isManager } = await loadTeamActor(prisma, t, team, user);
  assertRosterEditable(t, role);
  if (team.status === 'WITHDRAWN') throw err(409, 'TEAM_WITHDRAWN', 'Team withdrew');
  const data = {};
  if (b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 60) throw err(400, 'VALIDATION', 'name is required (max 60 chars)');
    data.name = name;
  }
  if (b.color !== undefined) data.color = typeof b.color === 'string' ? b.color.slice(0, 20) : null;
  if (b.logoUrl !== undefined) data.logoUrl = typeof b.logoUrl === 'string' ? b.logoUrl.slice(0, 1000) : null;
  for (const k of ['seed', 'manualRank']) {
    if (b[k] === undefined) continue;
    if (!isManager) throw err(403, 'FORBIDDEN', `Only managers may set ${k}`);
    if (b[k] !== null && (!Number.isInteger(b[k]) || b[k] < 1 || b[k] > 1000)) throw err(400, 'VALIDATION', `${k} must be a positive integer or null`);
    data[k] = b[k];
  }
  try {
    await prisma.tournamentTeam.update({ where: { id: teamId }, data });
  } catch (e) {
    if (e.code === 'P2002') throw err(409, 'NAME_TAKEN', 'A team with this name already exists');
    throw e;
  }
  return serializeTeam(prisma, teamId, { canSeeAll: true });
}

async function rotateJoinCode(user, tournamentId, teamId) {
  const t = await loadTournament(prisma, tournamentId);
  const team = await loadTeam(prisma, tournamentId, teamId);
  const { role } = await loadTeamActor(prisma, t, team, user);
  assertRosterEditable(t, role);
  const updated = await prisma.tournamentTeam.update({ where: { id: teamId }, data: { joinCode: newJoinCode() } });
  return { joinCode: updated.joinCode };
}

async function inviteMember(user, tournamentId, teamId, targetId) {
  if (typeof targetId !== 'string' || !targetId) throw err(400, 'VALIDATION', 'userId is required');
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    if (t.status === 'DRAFT') throw err(404, 'NOT_FOUND', 'Tournament not found');
    const team = await loadTeam(tx, tournamentId, teamId);
    const { role } = await loadTeamActor(tx, t, team, user);
    assertRosterEditable(t, role);
    if (DEAD_TEAM.includes(team.status)) throw err(409, 'TEAM_INACTIVE', 'Team is not active');
    const existing = await tx.tournamentTeamMember.findFirst({ where: { teamId, userId: targetId } });
    if (existing && existing.status === 'ACCEPTED') throw err(409, 'ALREADY_MEMBER', 'Player is already on this team');
    if (existing && existing.status === 'INVITED') return { member: await memberOf(tx, existing.id), t, team, created: false };
    await assertCanAdd(tx, t, team, { userId: targetId, isMinor: await isMinor(tx, targetId) }, { captainId: team.captainId });
    const member = existing
      ? await tx.tournamentTeamMember.update({ where: { id: existing.id }, data: { status: 'INVITED', role: 'PLAYER' } })
      : await tx.tournamentTeamMember.create({ data: { teamId, tournamentId, userId: targetId, status: 'INVITED' } });
    return { member: await memberOf(tx, member.id), t, team, created: true };
  });
}

async function memberOf(db, id) {
  const m = await db.tournamentTeamMember.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
  });
  return memberView(m);
}

async function respondToInvite(user, tournamentId, teamId, userId, accept) {
  if (userId !== user.id) throw err(403, 'FORBIDDEN', 'Only the invited player can respond');
  if (typeof accept !== 'boolean') throw err(400, 'VALIDATION', 'accept must be a boolean');
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    const team = await loadTeam(tx, tournamentId, teamId);
    const row = await tx.tournamentTeamMember.findFirst({ where: { teamId, userId, status: 'INVITED' } });
    if (!row) throw err(404, 'INVITE_NOT_FOUND', 'No pending invitation');
    if (!accept) {
      await tx.tournamentTeamMember.update({ where: { id: row.id }, data: { status: 'DECLINED' } });
      return { member: await memberOf(tx, row.id), team, t, accepted: false };
    }
    assertRosterEditable(t, null);
    if (DEAD_TEAM.includes(team.status)) throw err(409, 'TEAM_INACTIVE', 'Team is not active');
    if (await acceptedElsewhere(tx, tournamentId, userId, teamId)) {
      throw err(409, 'PLAYER_IN_OTHER_TEAM', 'You are already on another team in this tournament');
    }
    if (!t.openToMinors && (await isMinor(tx, userId))) throw err(403, 'MINORS_NOT_ALLOWED', 'This tournament is not open to minors');
    const accepted = await tx.tournamentTeamMember.count({ where: { teamId, status: 'ACCEPTED' } });
    if (accepted >= t.maxPlayersPerTeam) throw err(409, 'TOO_MANY_PLAYERS', 'The roster is full');
    await tx.tournamentTeamMember.update({ where: { id: row.id }, data: { status: 'ACCEPTED' } });
    await voidOtherInvites(tx, tournamentId, userId, teamId);
    await addToChat(tx, tournamentId, userId);
    return { member: await memberOf(tx, row.id), team, t, accepted: true };
  });
}

async function joinByCode(user, tournamentId, joinCode) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    if (t.status === 'DRAFT') throw err(404, 'NOT_FOUND', 'Tournament not found');
    const team = await tx.tournamentTeam.findFirst({ where: { tournamentId, joinCode: String(joinCode) } });
    if (!team) throw err(404, 'INVALID_CODE', 'Invalid join code');
    if (!registrationWindowOpen(t)) throw err(409, 'REGISTRATION_CLOSED', 'Registration is closed');
    assertRosterEditable(t, null);
    if (DEAD_TEAM.includes(team.status)) throw err(409, 'TEAM_INACTIVE', 'Team is not active');
    const own = await tx.tournamentTeamMember.findFirst({ where: { teamId: team.id, userId: user.id } });
    if (own && own.status === 'ACCEPTED') throw err(409, 'ALREADY_MEMBER', 'You are already on this team');
    await assertCanAdd(tx, t, team, { userId: user.id, isMinor: await isMinor(tx, user.id) }, { captainId: team.captainId });
    const member = own
      ? await tx.tournamentTeamMember.update({ where: { id: own.id }, data: { status: 'ACCEPTED', role: 'PLAYER' } })
      : await tx.tournamentTeamMember.create({ data: { teamId: team.id, tournamentId, userId: user.id, status: 'ACCEPTED' } });
    await voidOtherInvites(tx, tournamentId, user.id, team.id);
    await addToChat(tx, tournamentId, user.id);
    return { member: await memberOf(tx, member.id), team: await serializeTeam(tx, team.id, { canSeeAll: false }), t, captainId: team.captainId };
  });
}

async function updateMember(user, tournamentId, teamId, targetId, body) {
  const b = body || {};
  const t = await loadTournament(prisma, tournamentId);
  const team = await loadTeam(prisma, tournamentId, teamId);
  const { role } = await loadTeamActor(prisma, t, team, user);
  assertRosterEditable(t, role);
  const row = await prisma.tournamentTeamMember.findFirst({ where: { teamId, userId: targetId, status: 'ACCEPTED' } });
  if (!row) throw err(404, 'MEMBER_NOT_FOUND', 'Member not found');
  const data = {};
  if (b.jerseyNumber !== undefined) {
    if (b.jerseyNumber !== null && (!Number.isInteger(b.jerseyNumber) || b.jerseyNumber < 0 || b.jerseyNumber > 999)) {
      throw err(400, 'VALIDATION', 'jerseyNumber must be 0-999 or null');
    }
    data.jerseyNumber = b.jerseyNumber;
  }
  if (b.role !== undefined) {
    if (!['PLAYER', 'SUBSTITUTE'].includes(b.role) || row.role === 'CAPTAIN') throw err(400, 'VALIDATION', 'role must be PLAYER or SUBSTITUTE (captain is fixed)');
    data.role = b.role;
  }
  await prisma.tournamentTeamMember.update({ where: { id: row.id }, data });
  return memberOf(prisma, row.id);
}

async function removeMember(user, tournamentId, teamId, targetId) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    const team = await loadTeam(tx, tournamentId, teamId);
    const role = await getTournamentRole(tx, t, user);
    const isSelf = user.id === targetId;
    const isCaptain = team.captainId === user.id;
    if (!(isSelf || isCaptain || hasRoleAtLeast(role, 'MANAGER'))) throw err(403, 'FORBIDDEN', 'Not allowed');
    assertRosterEditable(t, role);
    if (targetId === team.captainId) throw err(409, 'CAPTAIN_CANNOT_LEAVE', 'The captain cannot be removed; withdraw the team instead');
    const row = await tx.tournamentTeamMember.findFirst({ where: { teamId, userId: targetId, status: { in: ['ACCEPTED', 'INVITED'] } } });
    if (!row) throw err(404, 'MEMBER_NOT_FOUND', 'Member not found');
    await tx.tournamentTeamMember.update({ where: { id: row.id }, data: { status: 'REMOVED' } });
    const stillRole = await tx.tournamentRole.findFirst({ where: { tournamentId, userId: targetId } });
    if (row.status === 'ACCEPTED' && !stillRole) {
      await tx.chatParticipant.deleteMany({ where: { chatId: tournamentId, userId: targetId } });
    }
    return { ok: true, t, team, wasAccepted: row.status === 'ACCEPTED' };
  });
}

async function decideTeam(user, tournamentId, teamId, decision) {
  if (!['APPROVE', 'REJECT', 'WAITLIST'].includes(decision)) throw err(400, 'VALIDATION', 'decision must be APPROVE, REJECT or WAITLIST');
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    const role = await getTournamentRole(tx, t, user);
    if (!hasRoleAtLeast(role, 'MANAGER')) throw err(role || t.status !== 'DRAFT' ? 403 : 404, role || t.status !== 'DRAFT' ? 'FORBIDDEN' : 'NOT_FOUND', 'Not allowed');
    if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(t.status)) {
      throw err(409, 'DECISIONS_CLOSED', 'Teams can only be decided before the tournament starts');
    }
    const team = await loadTeam(tx, tournamentId, teamId);
    if (team.status === 'WITHDRAWN') throw err(409, 'TEAM_WITHDRAWN', 'Team withdrew');
    const wasHolding = HELD.includes(team.status);
    let nextStatus;
    if (decision === 'APPROVE') {
      if (team.status === 'APPROVED') return { team: await serializeTeam(tx, teamId, { canSeeAll: true }), promoted: [], t, changed: false };
      const members = await tx.tournamentTeamMember.findMany({ where: { teamId, status: 'ACCEPTED' }, select: { userId: true } });
      const check = validateRoster({ captainId: team.captainId, members }, rulesOf(t), { enforceMin: true });
      if (!check.valid) throw err(409, 'ROSTER_INVALID', check.errors[0].message, { errors: check.errors });
      if (!wasHolding) {
        const held = await tx.tournamentTeam.count({ where: { tournamentId, status: { in: HELD } } });
        if (held >= t.maxTeams) throw err(409, 'TOURNAMENT_FULL', 'All team spots are taken');
      }
      nextStatus = 'APPROVED';
    } else {
      nextStatus = decision === 'REJECT' ? 'REJECTED' : 'WAITLISTED';
    }
    await tx.tournamentTeam.update({ where: { id: teamId }, data: { status: nextStatus } });
    const promoted = wasHolding && nextStatus !== 'APPROVED' ? await promoteWaitlist(tx, t, teamId) : [];
    return { team: await serializeTeam(tx, teamId, { canSeeAll: true }), promoted, t, changed: true, decision: nextStatus };
  });
}

async function withdrawTeam(user, tournamentId, teamId) {
  return prisma.$transaction(async (tx) => {
    await lockTournament(tx, tournamentId);
    const t = await loadTournament(tx, tournamentId);
    const team = await loadTeam(tx, tournamentId, teamId);
    const { role } = await loadTeamActor(tx, t, team, user);
    if (FINISHED_TOURNAMENT.includes(t.status)) throw err(409, 'TOURNAMENT_CLOSED', 'Tournament is finished');
    if (team.status === 'WITHDRAWN') return { ok: true, affectedMatchIds: [], promoted: [], t, team, already: true };
    const wasHolding = HELD.includes(team.status);
    await tx.tournamentTeam.update({ where: { id: teamId }, data: { status: 'WITHDRAWN' } });
    const promoted = wasHolding ? await promoteWaitlist(tx, t, teamId) : [];
    // Same transaction as the status change: a failure cannot leave a withdrawn team with live matches.
    const affectedMatchIds = await results.forfeitTeamMatchesTx(tx, t, user, teamId);
    return { ok: true, affectedMatchIds, promoted, t, team, role };
  });
}

/** Pending invitations of the caller across tournaments (for a "my invitations" screen). */
async function myInvites(user) {
  const rows = await prisma.tournamentTeamMember.findMany({
    where: { userId: user.id, status: 'INVITED', team: { status: { notIn: DEAD_TEAM }, tournament: { status: { in: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'] } } } },
    include: {
      team: { select: { id: true, name: true, color: true, logoUrl: true, captain: { select: { name: true } }, tournament: { select: { id: true, title: true, sport: true, startsAt: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    tournamentId: r.team.tournament.id,
    tournamentTitle: r.team.tournament.title,
    sport: r.team.tournament.sport,
    startsAt: r.team.tournament.startsAt,
    teamId: r.team.id,
    teamName: r.team.name,
    teamColor: r.team.color,
    captainName: publicDisplayName(r.team.captain && r.team.captain.name),
    invitedAt: r.createdAt,
  }));
}

module.exports = {
  registrationWindowOpen,
  createTeam,
  listTeams,
  getTeam,
  updateTeam,
  rotateJoinCode,
  inviteMember,
  respondToInvite,
  joinByCode,
  updateMember,
  removeMember,
  decideTeam,
  withdrawTeam,
  myInvites,
  serializeTeam,
  promoteWaitlist,
};
