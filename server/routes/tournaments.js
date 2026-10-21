const express = require('express');
const { authenticateToken } = require('../utils/auth');
const { canCreateTournament } = require('../utils/tournamentAccess');

const router = express.Router();

// Declared before any `/:id` route so "capabilities" is never read as a tournament id.
router.get('/capabilities', authenticateToken, (req, res) => {
  res.json({ canCreateTournaments: canCreateTournament(req.user) });
});

module.exports = router;
