// Tournament CRUD, status state machine, roles and visibility.
// Teams/roster live in tournamentTeamService, schedule in tournamentScheduleService, results in
// tournamentResultService; they share the helpers exported here.
const { prisma } = require('../lib/prisma');
const { validateLimits } = require('../shared/tournament/rosterRules');
const { publicDisplayName } = require('../utils/publicName');
const {
  canCreateTournament,
  getTournamentRole,
  canViewTournament,
  hasRoleAtLeast,
} = require('../utils/tournamentAccess');

class TournamentError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const TRANSITIONS = {
  DRAFT: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['REGISTRATION_OPEN', 'IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const SPORTS = ['SOCCER', 'BASKETBALL', 'TENNIS'];
const FORMATS = ['LEAGUE', 'KNOCKOUT', 'GROUPS_KNOCKOUT', 'CUSTOM'];
const TIEBREAKS = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR', 'WINS', 'FAIR_PLAY', 'DRAW_LOT'];
const DEFAULT_MATCH_MINUTES = { SOCCER: 60, BASKETBALL: 48, TENNIS: 60 };
const OPEN_STATUSES = ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'];
// Changing these after the schedule exists would invalidate it.
const STRUCTURAL_FIELDS = [
  'format', 'sport', 'minTeams', 'maxTeams', 'startersPerTeam', 'minPlayersPerTeam', 'maxPlayersPerTeam',
];
const EDITABLE_ALWAYS = ['title', 'description', 'imageUrl', 'customLocation', 'fieldId', 'endsAt', 'isPublic'];

const bad = (message, code = 'VALIDATION') => new TournamentError(400, code, message);

function parseDate(value, name, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw bad(`${name} must be an ISO date`);
  return d;
}

function intField(value, name, { min = 0, max = 10000, required = false, fallback } = {}) {
  if (value === undefined || value === null) {
    if (required) throw bad(`${name} is required`);
    return fallback;
  }
  if (!Number.isInteger(value) || value < min || value > max) throw bad(`${name} must be an integer ${min}-${max}`);
  return value;
}

function str(value, name, { required = false, max = 200 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  if (typeof value !== 'string') throw bad(`${name} must be a string`);
  const t = value.trim();
  if (required && !t) throw bad(`${name} is required`);
  if (t.length > max) throw bad(`${name} is too long`);
  return t || null;
}

/** Whitelists and defaults `rules`; unknown keys are dropped. */
function normalizeRules(raw, sport) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {
    points: { win: 3, draw: 1, loss: 0 },
    tiebreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
    forfeitScore: { winner: 3, loser: 0 },
    legs: 1,
    matchMinutes: DEFAULT_MATCH_MINUTES[sport] || 60,
    breakMinutes: 0,
    minRestMinutes: 0,
    thirdPlace: false,
    seeding: 'MANUAL',
    groupCount: 2,
    advancePerGroup: 2,
  };
  if (r.points !== undefined) {
    for (const k of ['win', 'draw', 'loss']) {
      out.points[k] = intField(r.points && r.points[k], `rules.points.${k}`, { min: -10, max: 10, fallback: out.points[k] });
    }
  }
  if (r.tiebreak !== undefined) {
    if (!Array.isArray(r.tiebreak) || r.tiebreak.some((t) => !TIEBREAKS.includes(t))) {
      throw bad(`rules.tiebreak must be a list of ${TIEBREAKS.join('/')}`);
    }
    out.tiebreak = r.tiebreak;
  }
  if (r.forfeitScore !== undefined) {
    out.forfeitScore = {
      winner: intField(r.forfeitScore && r.forfeitScore.winner, 'rules.forfeitScore.winner', { fallback: 3 }),
      loser: intField(r.forfeitScore && r.forfeitScore.loser, 'rules.forfeitScore.loser', { fallback: 0 }),
    };
  }
  if (r.legs !== undefined && r.legs !== 1 && r.legs !== 2) throw bad('rules.legs must be 1 or 2');
  out.legs = r.legs || 1;
  out.matchMinutes = intField(r.matchMinutes, 'rules.matchMinutes', { min: 5, max: 600, fallback: out.matchMinutes });
  out.breakMinutes = intField(r.breakMinutes, 'rules.breakMinutes', { min: 0, max: 600, fallback: 0 });
  out.minRestMinutes = intField(r.minRestMinutes, 'rules.minRestMinutes', { min: 0, max: 2000, fallback: 0 });
  if (r.thirdPlace !== undefined) {
    if (typeof r.thirdPlace !== 'boolean') throw bad('rules.thirdPlace must be a boolean');
    out.thirdPlace = r.thirdPlace;
  }
  if (r.seeding !== undefined) {
    if (!['MANUAL', 'RANDOM'].includes(r.seeding)) throw bad('rules.seeding must be MANUAL or RANDOM');
    out.seeding = r.seeding;
  }
  out.groupCount = intField(r.groupCount, 'rules.groupCount', { min: 1, max: 16, fallback: 2 });
  out.advancePerGroup = intField(r.advancePerGroup, 'rules.advancePerGroup', { min: 1, max: 16, fallback: 2 });
  if (sport === 'TENNIS') {
    if (r.bestOf !== undefined && r.bestOf !== 3 && r.bestOf !== 5) throw bad('rules.bestOf must be 3 or 5');
    out.bestOf = r.bestOf || 3;
  }
  return out;
}

function validateLimitFields(t) {
  if (t.minTeams > t.maxTeams) throw bad('minTeams must be <= maxTeams', 'INVALID_LIMITS');
  const errs = validateLimits({
    minPlayers: t.minPlayersPerTeam,
    maxPlayers: t.maxPlayersPerTeam,
    startersPerTeam: t.startersPerTeam,
  });
  if (errs.length) throw new TournamentError(400, errs[0].code, errs[0].message);
}

function validateDates(t) {
  if (t.endsAt && t.endsAt < t.startsAt) throw bad('endsAt must be after startsAt');
  if (t.registrationOpensAt && t.registrationClosesAt && t.registrationClosesAt < t.registrationOpensAt) {
    throw bad('registrationClosesAt must be after registrationOpensAt');
  }
}

async function assertField(db, fieldId) {
  if (!fieldId) return;
  const f = await db.field.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!f) throw bad('fieldId not found');
}

function parseCreateInput(body) {
  const b = body || {};
  if (!SPORTS.includes(b.sport)) throw bad(`sport must be one of ${SPORTS.join('/')}`);
  if (!FORMATS.includes(b.format)) throw bad(`format must be one of ${FORMATS.join('/')}`);
  const data = {
    title: str(b.title, 'title', { required: true, max: 120 }),
    description: str(b.description, 'description', { max: 4000 }),
    sport: b.sport,
    imageUrl: str(b.imageUrl, 'imageUrl', { max: 1000 }),
    fieldId: str(b.fieldId, 'fieldId', { max: 100 }),
    customLocation: str(b.customLocation, 'customLocation', { max: 200 }),
    startsAt: parseDate(b.startsAt, 'startsAt', { required: true }),
    endsAt: parseDate(b.endsAt, 'endsAt'),
    format: b.format,
    isPublic: b.isPublic === undefined ? true : !!b.isPublic,
    openToMinors: !!b.openToMinors,
    registrationOpensAt: parseDate(b.registrationOpensAt, 'registrationOpensAt'),
    registrationClosesAt: parseDate(b.registrationClosesAt, 'registrationClosesAt'),
    rosterLockAt: parseDate(b.rosterLockAt, 'rosterLockAt'),
    minTeams: intField(b.minTeams, 'minTeams', { min: 2, max: 256, fallback: 2 }),
    maxTeams: intField(b.maxTeams, 'maxTeams', { min: 2, max: 256, required: true }),
    startersPerTeam: intField(b.startersPerTeam, 'startersPerTeam', { min: 1, max: 50, required: true }),
    minPlayersPerTeam: intField(b.minPlayersPerTeam, 'minPlayersPerTeam', { min: 1, max: 100, required: true }),
    maxPlayersPerTeam: intField(b.maxPlayersPerTeam, 'maxPlayersPerTeam', { min: 1, max: 100, required: true }),
    requireApproval: b.requireApproval === undefined ? true : !!b.requireApproval,
    rules: normalizeRules(b.rules, b.sport),
  };
  validateLimitFields(data);
  validateDates(data);
  return data;
}

function summarize(t, extra = {}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    sport: t.sport,
    imageUrl: t.imageUrl,
    fieldId: t.fieldId,
    fieldName: t.field ? t.field.name : null,
    city: t.field ? t.field.city || null : null,
    customLocation: t.customLocation,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    status: t.status,
    format: t.format,
    isPublic: t.isPublic,
    openToMinors: t.openToMinors,
    registrationOpensAt: t.registrationOpensAt,
    registrationClosesAt: t.registrationClosesAt,
    rosterLockAt: t.rosterLockAt,
    minTeams: t.minTeams,
    maxTeams: t.maxTeams,
    startersPerTeam: t.startersPerTeam,
    minPlayersPerTeam: t.minPlayersPerTeam,
    maxPlayersPerTeam: t.maxPlayersPerTeam,
    requireApproval: t.requireApproval,
    rules: t.rules,
    organizerId: t.organizerId,
    createdAt: t.createdAt,
    ...extra,
  };
}

async function createTournament(user, body) {
  if (!canCreateTournament(user)) throw new TournamentError(403, 'FORBIDDEN', 'Not allowed to create tournaments');
  const data = parseCreatorInput(body);
  await assertField(prisma, data.fieldId);
  const created = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({ data: { ...data, organizerId: user.id } });
    await tx.tournamentRole.create({ data: { tournamentId: t.id, userId: user.id, role: 'ORGANIZER' } });
    // Same convention as games: chat room id === tournament id.
    await tx.chatRoom.create({
      data: { id: t.id, type: 'GROUP', participants: { create: [{ userId: user.id }] } },
    });
    return t;
  });
  return summarize(created, { myRole: 'ORGANIZER' });
}
const parseCreatorInput = parseCreateInput;

async function loadTournament(db, id, { include } = {}) {
  const t = await db.tournament.findUnique({ where: { id }, include });
  if (!t) throw new TournamentError(404, 'NOT_FOUND', 'Tournament not found');
  return t;
}

/** Loads the tournament and the viewer's role; 404 (not 403) when the viewer may not see it. */
async function loadForViewer(db, id, user, { include } = {}) {
  const t = await loadTournament(db, id, { include });
  const role = await getTournamentRole(db, t, user);
  if (!(await canViewTournament(db, t, user, role))) throw new TournamentError(404, 'NOT_FOUND', 'Tournament not found');
  return { tournament: t, role };
}

async function loadForRole(db, id, user, minRole, { include } = {}) {
  const t = await loadTournament(db, id, { include });
  const role = await getTournamentRole(db, t, user);
  if (!role) throw new TournamentError(t.status === 'DRAFT' ? 404 : 403, t.status === 'DRAFT' ? 'NOT_FOUND' : 'FORBIDDEN', 'Not allowed');
  if (!hasRoleAtLeast(role, minRole)) throw new TournamentError(403, 'FORBIDDEN', 'Not allowed');
  return { tournament: t, role };
}

/** Serialises concurrent writers of one tournament (registration, schedule generation). */
async function lockTournament(tx, id) {
  const rows = await tx.$queryRaw`SELECT "id" FROM "Tournament" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new TournamentError(404, 'NOT_FOUND', 'Tournament not found');
}

async function listTournaments(user, query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const published = { status: { not: 'DRAFT' }, isPublic: true };
  const ors = [published];
  if (user && user.id) {
    ors.push({ organizerId: user.id });
    ors.push({ roles: { some: { userId: user.id } } });
    ors.push({
      status: { not: 'DRAFT' },
      teams: { some: { members: { some: { userId: user.id, status: { not: 'REMOVED' } } } } },
    });
  }
  const and = [];
  if (!(user && user.isAdmin)) and.push({ OR: ors });
  if (query.status) {
    const statuses = String(query.status).split(',').filter((s) => Object.prototype.hasOwnProperty.call(TRANSITIONS, s));
    if (!statuses.length) throw bad('invalid status');
    and.push({ status: { in: statuses } });
  }
  if (query.sport) {
    if (!SPORTS.includes(query.sport)) throw bad('invalid sport');
    and.push({ sport: query.sport });
  }
  if (query.city) and.push({ field: { city: { equals: String(query.city), mode: 'insensitive' } } });
  if (query.mine && user && user.id) {
    and.push({
      OR: [
        { organizerId: user.id },
        { roles: { some: { userId: user.id } } },
        { teams: { some: { members: { some: { userId: user.id, status: { not: 'REMOVED' } } } } } },
      ],
    });
  }
  const rows = await prisma.tournament.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: limit,
    skip: offset,
    include: {
      field: { select: { name: true, city: true } },
      _count: { select: { teams: { where: { status: 'APPROVED' } } } },
    },
  });
  return rows.map((t) => summarize({ ...t, rules: undefined }, { approvedTeams: t._count.teams, rules: undefined }));
}

async function getOverview(user, id) {
  const { tournament, role } = await loadForViewer(prisma, id, user, {
    include: { field: { select: { name: true, city: true } } },
  });
  const [teamCounts, matchCounts, myMember] = await Promise.all([
    prisma.tournamentTeam.groupBy({ by: ['status'], where: { tournamentId: id }, _count: { _all: true } }),
    prisma.tournamentMatch.groupBy({ by: ['status'], where: { tournamentId: id }, _count: { _all: true } }),
    user && user.id
      ? prisma.tournamentTeamMember.findFirst({
          where: { tournamentId: id, userId: user.id, status: { in: ['INVITED', 'ACCEPTED'] } },
          orderBy: { status: 'asc' }, // ACCEPTED sorts before INVITED
          include: { team: { select: { id: true, name: true, status: true, captainId: true } } },
        })
      : null,
  ]);
  const teams = Object.fromEntries(teamCounts.map((r) => [r.status, r._count._all]));
  const matches = Object.fromEntries(matchCounts.map((r) => [r.status, r._count._all]));
  const myTeam = myMember
    ? {
        id: myMember.team.id,
        name: myMember.team.name,
        status: myMember.team.status,
        memberStatus: myMember.status,
        memberRole: myMember.role,
        isCaptain: myMember.team.captainId === user.id,
      }
    : null;
  const now = new Date();
  const registrationWindowOpen = tournament.status === 'REGISTRATION_OPEN'
    && (!tournament.registrationOpensAt || tournament.registrationOpensAt <= now)
    && (!tournament.registrationClosesAt || tournament.registrationClosesAt >= now);
  return summarize(tournament, {
    myRole: role,
    myTeam,
    counts: {
      teamsApproved: teams.APPROVED || 0,
      teamsPending: role ? teams.PENDING || 0 : undefined,
      teamsWaitlisted: role ? teams.WAITLISTED || 0 : undefined,
      matchesTotal: Object.values(matches).reduce((a, b) => a + b, 0),
      matchesFinished: (matches.FINISHED || 0) + (matches.FORFEIT || 0),
    },
    capabilities: {
      canManage: hasRoleAtLeast(role, 'MANAGER'),
      canScore: hasRoleAtLeast(role, 'SCOREKEEPER'),
      canManageRoles: hasRoleAtLeast(role, 'ORGANIZER'),
      canRegisterTeam: !!(user && user.id) && !myTeam && registrationWindowOpen,
    },
  });
}

async function updateTournament(user, id, body) {
  const b = body || {};
  const { tournament, role } = await loadForRole(prisma, id, user, 'MANAGER');
  if (tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED') {
    throw new TournamentError(409, 'TOURNAMENT_CLOSED', 'Tournament is finished');
  }
  const matchCount = await prisma.tournamentMatch.count({ where: { tournamentId: id } });
  const touched = Object.keys(b).filter((k) => STRUCTURAL_FIELDS.includes(k) && b[k] !== undefined && b[k] !== tournament[k]);
  if (touched.length) {
    if (!OPEN_STATUSES.includes(tournament.status)) {
      throw new TournamentError(409, 'LIMITS_LOCKED', `Cannot change ${touched.join(', ')} once the tournament started`);
    }
    if (matchCount > 0 && !(b.force === true && hasRoleAtLeast(role, 'ORGANIZER'))) {
      throw new TournamentError(409, 'LIMITS_LOCKED', `Cannot change ${touched.join(', ')} after the schedule was generated`, { fields: touched });
    }
  }
  const merged = { ...tournament };
  const data = {};
  const set = (k, v) => { data[k] = v; merged[k] = v; };
  if (b.title !== undefined) set('title', str(b.title, 'title', { required: true, max: 120 }));
  if (b.description !== undefined) set('description', str(b.description, 'description', { max: 4000 }));
  if (b.imageUrl !== undefined) set('imageUrl', str(b.imageUrl, 'imageUrl', { max: 1000 }));
  if (b.fieldId !== undefined) set('fieldId', str(b.fieldId, 'fieldId', { max: 100 }));
  if (b.customLocation !== undefined) set('customLocation', str(b.customLocation, 'customLocation', { max: 200 }));
  if (b.startsAt !== undefined) set('startsAt', parseDate(b.startsAt, 'startsAt', { required: true }));
  if (b.endsAt !== undefined) set('endsAt', parseDate(b.endsAt, 'endsAt'));
  if (b.registrationOpensAt !== undefined) set('registrationOpensAt', parseDate(b.registrationOpensAt, 'registrationOpensAt'));
  if (b.registrationClosesAt !== undefined) set('registrationClosesAt', parseDate(b.registrationClosesAt, 'registrationClosesAt'));
  if (b.rosterLockAt !== undefined) set('rosterLockAt', parseDate(b.rosterLockAt, 'rosterLockAt'));
  if (b.isPublic !== undefined) set('isPublic', !!b.isPublic);
  if (b.openToMinors !== undefined) set('openToMinors', !!b.openToMinors);
  if (b.requireApproval !== undefined) set('requireApproval', !!b.requireApproval);
  if (b.sport !== undefined) {
    if (!SPORTS.includes(b.sport)) throw bad(`sport must be one of ${SPORTS.join('/')}`);
    set('sport', b.sport);
  }
  if (b.format !== undefined) {
    if (!FORMATS.includes(b.format)) throw bad(`format must be one of ${FORMATS.join('/')}`);
    set('format', b.format);
  }
  for (const [k, lo, hi] of [
    ['minTeams', 2, 256], ['maxTeams', 2, 256], ['startersPerTeam', 1, 50],
    ['minPlayersPerTeam', 1, 100], ['maxPlayersPerTeam', 1, 100],
  ]) {
    if (b[k] !== undefined) set(k, intField(b[k], k, { min: lo, max: hi, required: true }));
  }
  if (b.rules !== undefined) set('rules', normalizeRules({ ...(tournament.rules || {}), ...(b.rules || {}) }, merged.sport));
  validateLimitFields(merged);
  validateDates(merged);
  if (data.fieldId) await assertField(prisma, data.fieldId);
  if (touched.some((k) => ['maxTeams'].includes(k))) {
    const held = await prisma.tournamentTeam.count({ where: { tournamentId: id, status: { in: ['APPROVED', 'PENDING'] } } });
    if (merged.maxTeams < held) throw new TournamentError(409, 'LIMITS_LOCKED', 'maxTeams is below the number of registered teams');
  }
  const updated = await prisma.tournament.update({ where: { id }, data });
  return summarize(updated, { myRole: role });
}

async function changeStatus(user, id, to, { force = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, to)) throw bad('invalid status');
  const result = await prisma.$transaction(async (tx) => {
    await lockTournament(tx, id);
    const t = await loadTournament(tx, id);
    const role = await getTournamentRole(tx, t, user);
    if (!role) throw new TournamentError(t.status === 'DRAFT' ? 404 : 403, t.status === 'DRAFT' ? 'NOT_FOUND' : 'FORBIDDEN', 'Not allowed');
    if (!hasRoleAtLeast(role, 'MANAGER')) throw new TournamentError(403, 'FORBIDDEN', 'Not allowed');
    if (!TRANSITIONS[t.status].includes(to)) {
      throw new TournamentError(409, 'INVALID_TRANSITION', `Cannot move from ${t.status} to ${to}`);
    }
    if (to === 'REGISTRATION_OPEN' && t.status === 'REGISTRATION_CLOSED') {
      const matches = await tx.tournamentMatch.count({ where: { tournamentId: id } });
      if (matches > 0) throw new TournamentError(409, 'SCHEDULE_EXISTS', 'Registration cannot reopen after the schedule was generated');
    }
    if (to === 'IN_PROGRESS') await assertCanStart(tx, t, force && hasRoleAtLeast(role, 'ORGANIZER'));
    if (to === 'CANCELLED') {
      await tx.tournamentMatch.updateMany({
        where: { tournamentId: id, status: { in: ['SCHEDULED', 'LIVE', 'POSTPONED'] } },
        data: { status: 'CANCELLED' },
      });
    }
    const updated = await tx.tournament.update({ where: { id }, data: { status: to } });
    return { tournament: updated, from: t.status, role };
  });
  return { ...summarize(result.tournament, { myRole: result.role }), previousStatus: result.from };
}

async function assertCanStart(tx, t, force) {
  const teams = await tx.tournamentTeam.findMany({
    where: { tournamentId: t.id, status: 'APPROVED' },
    include: { members: { where: { status: 'ACCEPTED' }, select: { userId: true } } },
  });
  const problems = [];
  if (teams.length < t.minTeams) problems.push({ code: 'TOO_FEW_TEAMS', approved: teams.length, minTeams: t.minTeams });
  for (const team of teams) {
    const n = team.members.length;
    if (n < t.minPlayersPerTeam || n > t.maxPlayersPerTeam) {
      problems.push({ code: n < t.minPlayersPerTeam ? 'TOO_FEW_PLAYERS' : 'TOO_MANY_PLAYERS', teamId: team.id, players: n });
    }
  }
  const matches = await tx.tournamentMatch.count({ where: { tournamentId: t.id } });
  if (!matches) problems.push({ code: 'NO_SCHEDULE' });
  if (problems.length && !force) {
    throw new TournamentError(409, 'CANNOT_START', 'Tournament is not ready to start', { problems });
  }
}

async function listRoles(user, id) {
  await loadForRole(prisma, id, user, 'MANAGER');
  const rows = await prisma.tournamentRole.findMany({
    where: { tournamentId: id },
    include: { user: { select: { id: true, name: true, imageUrl: true } } },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => ({
    userId: r.userId,
    role: r.role,
    name: publicDisplayName(r.user && r.user.name),
    imageUrl: (r.user && r.user.imageUrl) || null,
  }));
}

async function setRole(user, id, targetId, role) {
  if (!['MANAGER', 'SCOREKEEPER'].includes(role)) throw bad('role must be MANAGER or SCOREKEEPER');
  if (typeof targetId !== 'string' || !targetId) throw bad('userId is required');
  const { tournament } = await loadForRole(prisma, id, user, 'ORGANIZER');
  if (targetId === tournament.organizerId) throw bad('The organizer already has full access');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw new TournamentError(404, 'USER_NOT_FOUND', 'User not found');
  const existing = await prisma.tournamentRole.findUnique({
    where: { tournamentId_userId: { tournamentId: id, userId: targetId } },
  });
  if (existing && existing.role === 'ORGANIZER') throw bad('Cannot change an organizer role');
  const row = await prisma.tournamentRole.upsert({
    where: { tournamentId_userId: { tournamentId: id, userId: targetId } },
    update: { role },
    create: { tournamentId: id, userId: targetId, role },
  });
  await prisma.chatParticipant.create({ data: { chatId: id, userId: targetId } }).catch((e) => {
    if (e.code !== 'P2002') throw e;
  });
  return { userId: row.userId, role: row.role };
}

async function removeRole(user, id, targetId) {
  const { tournament } = await loadForRole(prisma, id, user, 'ORGANIZER');
  if (targetId === tournament.organizerId) throw bad('The organizer role cannot be removed');
  const existing = await prisma.tournamentRole.findUnique({
    where: { tournamentId_userId: { tournamentId: id, userId: targetId } },
  });
  if (!existing) throw new TournamentError(404, 'NOT_FOUND', 'Role not found');
  if (existing.role === 'ORGANIZER') throw bad('Cannot remove an organizer role');
  await prisma.tournamentRole.delete({ where: { id: existing.id } });
  return { ok: true };
}

/** `tournament:update` realtime event. Clients refetch; the payload carries no private data. */
function emitTournamentUpdate(io, tournamentId, payload = {}) {
  if (!io || !tournamentId) return;
  try {
    io.to(`tournament:${tournamentId}`).emit('tournament:update', { tournamentId, ...payload, at: new Date().toISOString() });
  } catch (e) {
    console.warn('[tournament] emit failed:', e && e.message);
  }
}

module.exports = {
  TournamentError,
  TRANSITIONS,
  OPEN_STATUSES,
  EDITABLE_ALWAYS,
  SPORTS,
  prisma,
  normalizeRules,
  createTournament,
  listTournaments,
  getOverview,
  updateTournament,
  changeStatus,
  listRoles,
  setRole,
  removeRole,
  loadTournament,
  loadForViewer,
  loadForRole,
  lockTournament,
  emitTournamentUpdate,
  summarize,
};
