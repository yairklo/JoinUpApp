const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken } = require('../utils/auth');
const { getActiveGameStartCutoff } = require('../utils/timezone');
const { resolveSportFilters } = require('../utils/sports');

const router = express.Router();

/**
 * GET /api/search/global?q=...
 * Unified omnibar search across Users, Fields and public Games.
 * Fires three optimized Prisma queries concurrently and returns a
 * category-divided payload. Rejects queries shorter than 2 chars to
 * prevent DB flooding on every keystroke.
 */
router.get('/global', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();

    // Input guard: too short → return empty payload without touching the DB.
    if (q.length < 2) {
      return res.json({ users: [], fields: [], games: [] });
    }

    const loggedInUserId = req.user.id;

    const sportFilter = resolveSportFilters(q);

    const gameOr = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
    if (sportFilter.length > 0) {
      gameOr.push({ sport: { in: sportFilter } });
    }

    const [users, fields, games] = await Promise.all([
      // Users — match by name, exclude self and mock accounts.
      prisma.user.findMany({
        where: {
          id: { not: loggedInUserId },
          name: { contains: q, mode: 'insensitive' },
          OR: [
            { email: null },
            { NOT: { email: { contains: '@mock.joinup.com' } } },
          ],
        },
        select: { id: true, name: true, imageUrl: true },
        take: 5,
      }),

      // Fields — match by name OR city, only available fields.
      prisma.field.findMany({
        where: {
          available: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, city: true },
        take: 5,
      }),

      // Games — public (not friends-only), open, upcoming or within 30-min grace.
      prisma.game.findMany({
        where: {
          status: 'OPEN',
          start: { gte: getActiveGameStartCutoff() },
          isFriendsOnly: false,
          OR: gameOr,
        },
        select: {
          id: true,
          title: true,
          sport: true,
          start: true,
          field: { select: { name: true, city: true } },
        },
        orderBy: { start: 'asc' },
        take: 5,
      }),
    ]);

    return res.json({ users, fields, games });
  } catch (err) {
    console.error('[Global Search] Failed:', err);
    return res.status(500).json({ error: 'Global search failed' });
  }
});

module.exports = router;
