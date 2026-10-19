const express = require('express');
const { authenticateToken } = require('../utils/auth');
const { prisma } = require('../services/gameService');

const router = express.Router();

// A game that started up to this long ago is still "live" for a manager (they may be running it).
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;
const GAME_FIELDS = {
  id: true,
  title: true,
  start: true,
  duration: true,
  maxPlayers: true,
  status: true,
  sport: true,
  seriesId: true,
  organizerId: true,
  field: { select: { name: true } },
  customLocation: true,
};

async function countByStatus(gameIds) {
  const counts = new Map();
  if (gameIds.length === 0) return counts;
  const rows = await prisma.participation.groupBy({
    by: ['gameId', 'status'],
    where: { gameId: { in: gameIds }, status: { in: ['CONFIRMED', 'WAITLISTED', 'PENDING'] } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const c = counts.get(r.gameId) || { confirmed: 0, waitlisted: 0, pending: 0 };
    if (r.status === 'CONFIRMED') c.confirmed = r._count._all;
    else if (r.status === 'WAITLISTED') c.waitlisted = r._count._all;
    else c.pending = r._count._all;
    counts.set(r.gameId, c);
  }
  return counts;
}

function mapGame(game, counts, role) {
  const c = counts.get(game.id) || { confirmed: 0, waitlisted: 0, pending: 0 };
  return {
    id: game.id,
    title: game.title || null,
    start: game.start.toISOString(),
    duration: game.duration,
    sport: game.sport,
    fieldName: game.field?.name || game.customLocation || '',
    maxPlayers: game.maxPlayers,
    confirmedCount: c.confirmed,
    waitlistCount: c.waitlisted,
    pendingCount: c.pending,
    seriesId: game.seriesId || null,
    role,
  };
}

/**
 * Everything the signed-in user manages, in one round trip:
 * - groups: recurring groups (GameSeries) they organize or manage, each with its next game.
 * - games: upcoming games they organize / hold a game role on that are NOT already covered
 *   by a group above (standalone games, or a single game of someone else's group).
 * - attention: the items that need action now (join requests, a filled waitlist).
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const cutoff = new Date(Date.now() - LIVE_WINDOW_MS);

    const seriesList = await prisma.gameSeries.findMany({
      where: {
        isActive: true,
        OR: [
          { organizerId: userId },
          { subscribers: { some: { userId, role: 'MANAGER' } } },
        ],
      },
      include: { _count: { select: { subscribers: true } } },
    });
    const seriesIds = seriesList.map((s) => s.id);

    const seriesGames = seriesIds.length
      ? await prisma.game.findMany({
          where: { seriesId: { in: seriesIds }, status: 'OPEN', start: { gte: cutoff } },
          select: GAME_FIELDS,
          orderBy: { start: 'asc' },
        })
      : [];

    const individualGames = await prisma.game.findMany({
      where: {
        status: 'OPEN',
        start: { gte: cutoff },
        AND: [
          { OR: [{ organizerId: userId }, { roles: { some: { userId, role: 'MANAGER' } } }] },
          // NOT IN would drop standalone games, because their seriesId is NULL.
          { OR: [{ seriesId: null }, { seriesId: { notIn: seriesIds } }] },
        ],
      },
      select: GAME_FIELDS,
      orderBy: { start: 'asc' },
      take: 50,
    });

    const counts = await countByStatus([...seriesGames, ...individualGames].map((g) => g.id));

    const gamesBySeries = new Map();
    for (const g of seriesGames) {
      const list = gamesBySeries.get(g.seriesId) || [];
      list.push(g);
      gamesBySeries.set(g.seriesId, list);
    }

    const groups = seriesList.map((s) => {
      const role = s.organizerId === userId ? 'ORGANIZER' : 'MANAGER';
      const upcoming = gamesBySeries.get(s.id) || [];
      const pendingRequestCount = upcoming.reduce((sum, g) => sum + (counts.get(g.id)?.pending || 0), 0);
      return {
        id: s.id,
        name: s.title || `${s.fieldName} • ${s.time}`,
        title: s.title || null,
        fieldName: s.fieldName,
        dayOfWeek: s.dayOfWeek,
        time: s.time,
        sport: s.sport,
        imageUrl: s.imageUrl || null,
        role,
        memberCount: s._count.subscribers,
        pendingRequestCount,
        nextGame: upcoming[0] ? mapGame(upcoming[0], counts, role) : null,
      };
    });
    // The group whose next game is soonest comes first; groups with no scheduled game go last.
    groups.sort((a, b) => {
      const at = a.nextGame ? Date.parse(a.nextGame.start) : Infinity;
      const bt = b.nextGame ? Date.parse(b.nextGame.start) : Infinity;
      return at - bt;
    });

    const games = individualGames.map((g) =>
      mapGame(g, counts, g.organizerId === userId ? 'ORGANIZER' : 'MANAGER')
    );

    const attention = [];
    for (const g of [...seriesGames, ...individualGames]) {
      const c = counts.get(g.id);
      if (!c) continue;
      if (c.pending > 0) attention.push({ type: 'PENDING_REQUESTS', gameId: g.id, seriesId: g.seriesId || null, count: c.pending, start: g.start.toISOString() });
      if (c.waitlisted > 0 && c.confirmed >= g.maxPlayers) {
        attention.push({ type: 'WAITLIST', gameId: g.id, seriesId: g.seriesId || null, count: c.waitlisted, start: g.start.toISOString() });
      }
    }
    attention.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    res.json({ groups, games, attention });
  } catch (error) {
    console.error('Manage overview error:', error);
    res.status(500).json({ error: 'Failed to load managed groups and games' });
  }
});

module.exports = router;
