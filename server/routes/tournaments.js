const express = require('express');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { canCreateTournament } = require('../utils/tournamentAccess');
const svc = require('../services/tournamentService');
const teams = require('../services/tournamentTeamService');
const schedule = require('../services/tournamentScheduleService');
const results = require('../services/tournamentResultService');
const notify = require('../services/tournamentNotifications');
const { tournamentsGate, isTournamentsPublic, canViewTournaments } = require('../utils/tournamentGate');

const router = express.Router();

/** Wraps an async handler: TournamentError -> {error, code, ...extra}, anything else -> 500. */
const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    if (e instanceof svc.TournamentError) {
      return res.status(e.status).json({ error: e.message, code: e.code, ...e.extra });
    }
    console.error('[tournaments]', req.method, req.originalUrl, e);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Declared before any `/:id` route so "capabilities" is never read as a tournament id. Also before
// the gate: guests and outsiders must be able to ask whether the feature is visible to them.
router.get('/capabilities', attachOptionalUser, handle(async (req) => {
  const canCreate = canCreateTournament(req.user);
  return {
    public: await isTournamentsPublic(),
    canView: await canViewTournaments(req.user),
    canCreate,
    canCreateTournaments: canCreate, // legacy field read by shipped clients
  };
}));

router.use(tournamentsGate);

// Pending team invitations of the caller; also before `/:id`.
router.get('/my-invites', authenticateToken, handle((req) => teams.myInvites(req.user)));

router.get('/', attachOptionalUser, handle((req) => svc.listTournaments(req.user, req.query)));

router.post('/', authenticateToken, handle(async (req, res) => {
  res.status(201);
  return svc.createTournament(req.user, req.body);
}));

router.get('/:id', attachOptionalUser, handle((req) => svc.getOverview(req.user, req.params.id)));

router.patch('/:id', authenticateToken, handle((req) => svc.updateTournament(req.user, req.params.id, req.body)));

router.post('/:id/status', authenticateToken, handle((req) => {
  const { status, force } = req.body || {};
  return svc.changeStatus(req.user, req.params.id, status, { force: force === true });
}));

router.get('/:id/roles', authenticateToken, handle((req) => svc.listRoles(req.user, req.params.id)));

router.post('/:id/roles', authenticateToken, handle((req) => {
  const { userId, role } = req.body || {};
  return svc.setRole(req.user, req.params.id, userId, role);
}));

router.delete('/:id/roles/:userId', authenticateToken, handle((req) => svc.removeRole(req.user, req.params.id, req.params.userId)));

const emit = (req, type, extra) => svc.emitTournamentUpdate(req.app.get('io'), req.params.id, { type, ...extra });

// ---- teams & roster ----------------------------------------------------------------------
router.post('/:id/teams', authenticateToken, handle(async (req, res) => {
  const out = await teams.createTeam(req.user, req.params.id, req.body);
  emit(req, 'teams');
  res.status(201);
  return out;
}));

router.get('/:id/teams', attachOptionalUser, handle((req) => teams.listTeams(req.user, req.params.id, req.query)));
router.get('/:id/teams/:teamId', attachOptionalUser, handle((req) => teams.getTeam(req.user, req.params.id, req.params.teamId)));

router.patch('/:id/teams/:teamId', authenticateToken, handle(async (req) => {
  const out = await teams.updateTeam(req.user, req.params.id, req.params.teamId, req.body);
  emit(req, 'teams');
  // A manualRank can settle a group tie, which unlocks the knockout slots that wait for it.
  if ((req.body || {}).manualRank !== undefined) {
    const r = await results.recomputeAdvancement(req.user, req.params.id);
    if (r.changedMatchIds.length) emit(req, 'result', { changedMatchIds: r.changedMatchIds });
  }
  return out;
}));

router.delete('/:id/teams/:teamId', authenticateToken, handle(async (req) => {
  const out = await teams.withdrawTeam(req.user, req.params.id, req.params.teamId);
  // Scheduled matches of a withdrawn team were forfeited (or postponed when the opponent is TBD) in the same transaction.
  emit(req, 'teams');
  if (out.affectedMatchIds.length) emit(req, 'schedule');
  notify.notifyPromoted({ tournament: out.t, teamIds: out.promoted, io: req.app.get('io') });
  return { ok: true, affectedMatchIds: out.affectedMatchIds, promotedTeamIds: out.promoted };
}));

router.post('/:id/teams/:teamId/decision', authenticateToken, handle(async (req) => {
  const out = await teams.decideTeam(req.user, req.params.id, req.params.teamId, (req.body || {}).decision);
  emit(req, 'teams');
  const io = req.app.get('io');
  if (out.changed) {
    notify.notifyTeamDecision({ tournament: out.t, team: out.team, status: out.team.status, io });
    notify.notifyPromoted({ tournament: out.t, teamIds: out.promoted, io });
  }
  return { team: out.team, promotedTeamIds: out.promoted };
}));

router.post('/:id/teams/:teamId/join-code/rotate', authenticateToken, handle((req) => teams.rotateJoinCode(req.user, req.params.id, req.params.teamId)));

router.post('/:id/teams/:teamId/members', authenticateToken, handle(async (req, res) => {
  const out = await teams.inviteMember(req.user, req.params.id, req.params.teamId, (req.body || {}).userId);
  emit(req, 'teams');
  if (out.created) {
    notify.notifyTeamInvite({ tournament: out.t, team: out.team, inviterId: req.user.id, inviteeId: req.body.userId, io: req.app.get('io') });
  }
  res.status(out.created ? 201 : 200);
  return { member: out.member };
}));

router.post('/:id/teams/:teamId/members/:userId/respond', authenticateToken, handle(async (req) => {
  const out = await teams.respondToInvite(req.user, req.params.id, req.params.teamId, req.params.userId, (req.body || {}).accept);
  emit(req, 'teams');
  return { member: out.member, accepted: out.accepted };
}));

router.patch('/:id/teams/:teamId/members/:userId', authenticateToken, handle((req) => teams.updateMember(req.user, req.params.id, req.params.teamId, req.params.userId, req.body)));

router.delete('/:id/teams/:teamId/members/:userId', authenticateToken, handle(async (req) => {
  await teams.removeMember(req.user, req.params.id, req.params.teamId, req.params.userId, req.app.get('io'));
  emit(req, 'teams');
  return { ok: true };
}));

router.post('/:id/join/:joinCode', authenticateToken, handle(async (req) => {
  const out = await teams.joinByCode(req.user, req.params.id, req.params.joinCode);
  emit(req, 'teams');
  return { member: out.member, team: out.team };
}));

// ---- schedule & matches ------------------------------------------------------------------
router.post('/:id/schedule/generate', authenticateToken, handle(async (req) => {
  const preview = req.query.preview === '1' || req.query.preview === 'true';
  const out = await schedule.generateSchedule(req.user, req.params.id, req.body, { preview });
  if (!preview) {
    emit(req, 'schedule');
    notify.notifyMatchesScheduled({ tournament: out.t, matchIds: out.scheduledMatchIds, io: req.app.get('io') });
  }
  const { t, scheduledMatchIds, ...rest } = out;
  return rest;
}));

router.post('/:id/matches', authenticateToken, handle(async (req, res) => {
  const out = await schedule.createMatch(req.user, req.params.id, req.body);
  emit(req, 'schedule', { matchId: out.match.id });
  if (out.scheduleChanged) notify.notifyMatchesScheduled({ tournament: out.t, matchIds: [out.match.id], io: req.app.get('io') });
  res.status(201);
  return { match: out.match, conflicts: out.conflicts };
}));

router.patch('/:id/matches/:matchId', authenticateToken, handle(async (req) => {
  const out = await schedule.updateMatch(req.user, req.params.id, req.params.matchId, req.body);
  emit(req, 'schedule', { matchId: req.params.matchId });
  if (out.scheduleChanged) notify.notifyMatchesScheduled({ tournament: out.t, matchIds: [req.params.matchId], io: req.app.get('io') });
  return { match: out.match, conflicts: out.conflicts };
}));

router.delete('/:id/matches/:matchId', authenticateToken, handle(async (req) => {
  await schedule.deleteMatch(req.user, req.params.id, req.params.matchId);
  emit(req, 'schedule', { matchId: req.params.matchId });
  return { ok: true };
}));

// ---- results & computed views ------------------------------------------------------------
router.put('/:id/matches/:matchId/result', authenticateToken, handle(async (req) => {
  const out = await results.putResult(req.user, req.params.id, req.params.matchId, req.body);
  emit(req, 'result', { matchId: req.params.matchId, changedMatchIds: out.changedMatchIds });
  return { match: out.match, changedMatchIds: out.changedMatchIds, warnings: out.warnings };
}));

router.get('/:id/schedule', attachOptionalUser, handle((req) => results.getSchedule(req.user, req.params.id, req.query)));
router.get('/:id/standings', attachOptionalUser, handle((req) => results.getStandings(req.user, req.params.id)));

router.put('/:id/standings/override', authenticateToken, handle(async (req) => {
  const out = await results.putStandingsOverride(req.user, req.params.id, req.body);
  emit(req, 'result', { changedMatchIds: out.changedMatchIds });
  return out;
}));

router.delete('/:id/standings/override', authenticateToken, handle(async (req) => {
  const out = await results.deleteStandingsOverride(req.user, req.params.id, req.body);
  emit(req, 'result', { changedMatchIds: out.changedMatchIds });
  return out;
}));
router.get('/:id/bracket', attachOptionalUser, handle((req) => results.getBracket(req.user, req.params.id)));
router.get('/:id/stats/leaders', attachOptionalUser, handle((req) => results.getLeaders(req.user, req.params.id, req.query)));

module.exports = router;
