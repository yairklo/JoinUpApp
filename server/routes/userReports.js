const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken } = require('../utils/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const REASONS = [
  'HARASSMENT',
  'VIOLENCE',
  'CHEATING',
  'NO_SHOW',
  'FAKE_PROFILE',
  'INAPPROPRIATE_CONTENT',
  'RESULT_DISPUTE',
  'OTHER',
];
const MAX_DETAILS_LENGTH = 1000;

const reportLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, prefix: 'user-report' });

// POST /api/user-reports - report a player's behaviour. Always answers `201 { ok: true }` for any
// valid request (blocked pairs and duplicates included) so a block cannot be detected from here
// (docs/qa/blocks-and-privacy-contract.md).
router.post('/', authenticateToken, reportLimiter, async (req, res) => {
  try {
    const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().toUpperCase() : '';
    const rawDetails = req.body?.details;
    const gameId = typeof req.body?.gameId === 'string' && req.body.gameId.trim() ? req.body.gameId.trim() : null;

    if (!targetId) return res.status(400).json({ error: 'targetId is required' });
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of ${REASONS.join(', ')}` });
    }
    if (rawDetails != null && typeof rawDetails !== 'string') {
      return res.status(400).json({ error: 'details must be a string' });
    }
    const details = typeof rawDetails === 'string' ? rawDetails.trim() : '';
    if (details.length > MAX_DETAILS_LENGTH) {
      return res.status(400).json({ error: `details must be up to ${MAX_DETAILS_LENGTH} characters` });
    }
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const existing = await prisma.userReport.findFirst({
      where: { reporterId: req.user.id, targetId, gameId, status: 'OPEN' },
      select: { id: true },
    });
    if (!existing) {
      await prisma.userReport.create({
        data: { reporterId: req.user.id, targetId, gameId, reason, details: details || null },
      });
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Create user report error:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

module.exports = router;
