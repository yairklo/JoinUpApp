const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateToken } = require('../utils/auth');

const router = express.Router();

// Maps common Hebrew (and shorthand) sport terms to the Prisma SportType enum.
// Lets Hebrew users typing "כדורגל"/"טניס" match games by sport, since the
// enum is stored in English. Partial terms ("רגל"/"סל") are supported too.
const hebrewSportMap = {
  'כדורגל': 'SOCCER', 'רגל': 'SOCCER',
  'כדורסל': 'BASKETBALL', 'סל': 'BASKETBALL',
  'טניס': 'TENNIS'
};

const SPORT_ENUMS = ['SOCCER', 'BASKETBALL', 'TENNIS'];

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
    const lowerQ = q.toLowerCase();

    // Resolve which sport enums the query matches, via English name substring
    // AND the explicit Hebrew mapping.
    const sportMatches = new Set(
      SPORT_ENUMS.filter((s) => s.toLowerCase().includes(lowerQ))
    );
    for (const [hebrew, enumValue] of Object.entries(hebrewSportMap)) {
      if (hebrew.includes(q) || q.includes(hebrew)) {
        sportMatches.add(enumValue);
      }
    }
    const sportFilter = [...sportMatches];

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

      // Games — public (not friends-only), open and upcoming.
      prisma.game.findMany({
        where: {
          status: 'OPEN',
          start: { gte: new Date() },
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
