const express = require('express');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { canCreateTournament } = require('../utils/tournamentAccess');
const svc = require('../services/tournamentService');

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

module.exports = router;
