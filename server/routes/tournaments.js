const express = require('express');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { canCreateTournament } = require('../utils/tournamentAccess');
const svc = require('../services/tournamentService');
const teams = require('../services/tournamentTeamService');

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

// Declared before any `/:id` route so "capabilities" is never read as a tournament id.
router.get('/capabilities', authenticateToken, (req, res) => {
  res.json({ canCreateTournaments: canCreateTournament(req.user) });
});

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
  return out;
}));

router.delete('/:id/teams/:teamId', authenticateToken, handle(async (req) => {
  const out = await teams.withdrawTeam(req.user, req.params.id, req.params.teamId);
  emit(req, 'teams');
  return { ok: true, affectedMatchIds: out.affectedMatchIds, promotedTeamIds: out.promoted };
}));

router.post('/:id/teams/:teamId/decision', authenticateToken, handle(async (req) => {
  const out = await teams.decideTeam(req.user, req.params.id, req.params.teamId, (req.body || {}).decision);
  emit(req, 'teams');
  return { team: out.team, promotedTeamIds: out.promoted };
}));

router.post('/:id/teams/:teamId/join-code/rotate', authenticateToken, handle((req) => teams.rotateJoinCode(req.user, req.params.id, req.params.teamId)));

router.post('/:id/teams/:teamId/members', authenticateToken, handle(async (req, res) => {
  const out = await teams.inviteMember(req.user, req.params.id, req.params.teamId, (req.body || {}).userId);
  emit(req, 'teams');
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
  await teams.removeMember(req.user, req.params.id, req.params.teamId, req.params.userId);
  emit(req, 'teams');
  return { ok: true };
}));

router.post('/:id/join/:joinCode', authenticateToken, handle(async (req) => {
  const out = await teams.joinByCode(req.user, req.params.id, req.params.joinCode);
  emit(req, 'teams');
  return { member: out.member, team: out.team };
}));

module.exports = router;
