const express = require('express');
const { authenticateToken } = require('../utils/auth');
const { prisma } = require('../services/gameService');

const router = express.Router();

const HOUR_MS = 60 * 60 * 1000;
// A game stays "live" for a manager until it has ended plus this grace (they may still be wrapping it up).
const END_GRACE_MS = 1 * HOUR_MS;
// Longest game we expect; bounds the SQL window, the exact per-game cutoff is applied in JS below.
const MAX_GAME_HOURS = 12;
// Group games are only needed for the next game and the pending/attention counts.
const GROUP_HORIZON_MS = 45 * 24 * HOUR_MS;
const GROUP_GAMES_CAP = 500;
const STANDALONE_GAMES_CAP = 50;
const ATTENTION_CAP = 20;

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

function isStillLive(game, now) {
  const endsAt = game.start.getTime() + (game.duration || 1) * HOUR_MS;
  return endsAt + END_GRACE_MS >= now;
}

function compareByStart(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

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
 * - attention: the items that need action now (join requests, a filled waitlist), labelled so the
 *   client can say which group or game each one belongs to.
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const nowMs = Date.now();
    const windowStart = new Date(nowMs - MAX_GAME_HOURS * HOUR_MS);
    const horizon = new Date(nowMs + GROUP_HORIZON_MS);

    const managedSeries = await prisma.gameSeries.findMany({
      where: {
        OR: [
          { organizerId: userId },
          { subscribers: { some: { userId, role: 'MANAGER' } } },
        ],
      },
      include: { _count: { select: { subscribers: true } } },
    });
    const seriesList = managedSeries.filter((s) => s.isActive);
    // Games of a deactivated group the user manages are not "single games": keep them out of both lists.
    const managedSeriesIds = managedSeries.map((s) => s.id);
    const activeSeriesIds = seriesList.map((s) => s.id);

    const seriesGames = activeSeriesIds.length
      ? (await prisma.game.findMany({
          where: {
            seriesId: { in: activeSeriesIds },
            status: 'OPEN',
            start: { gte: windowStart, lte: horizon },
          },
          select: GAME_FIELDS,
          orderBy: { start: 'asc' },
          take: GROUP_GAMES_CAP,
        })).filter((g) => isStillLive(g, nowMs))
      : [];

    const individualGames = (await prisma.game.findMany({
      where: {
        status: 'OPEN',
        start: { gte: windowStart },
        AND: [
          { OR: [{ organizerId: userId }, { roles: { some: { userId, role: 'MANAGER' } } }] },
          // NOT IN would drop standalone games, because their seriesId is NULL.
          { OR: [{ seriesId: null }, { seriesId: { notIn: managedSeriesIds } }] },
        ],
      },
      select: GAME_FIELDS,
      orderBy: { start: 'asc' },
      // Over-fetch a little: some rows are dropped by the end-of-game filter below.
      take: STANDALONE_GAMES_CAP + 20,
    })).filter((g) => isStillLive(g, nowMs)).slice(0, STANDALONE_GAMES_CAP);

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
      const at = a.nextGame ? Date.parse(a.nextGame.start) : Number.MAX_SAFE_INTEGER;
      const bt = b.nextGame ? Date.parse(b.nextGame.start) : Number.MAX_SAFE_INTEGER;
      return compareByStart(at, bt);
    });

    const games = individualGames.map((g) =>
      mapGame(g, counts, g.organizerId === userId ? 'ORGANIZER' : 'MANAGER')
    );

    const seriesNameById = new Map(seriesList.map((s) => [s.id, s.title || `${s.fieldName} • ${s.time}`]));
    const labelFor = (g) =>
      (g.seriesId && seriesNameById.get(g.seriesId)) || g.title || g.field?.name || g.customLocation || '';

    const attention = [];
    for (const g of [...seriesGames, ...individualGames]) {
      const c = counts.get(g.id);
      if (!c) continue;
      const base = {
        gameId: g.id,
        seriesId: g.seriesId || null,
        label: labelFor(g),
        start: g.start.toISOString(),
      };
      if (c.pending > 0) attention.push({ ...base, type: 'PENDING_REQUESTS', count: c.pending });
      if (c.waitlisted > 0 && c.confirmed >= g.maxPlayers) {
        attention.push({ ...base, type: 'WAITLIST', count: c.waitlisted });
      }
    }
    attention.sort((a, b) => compareByStart(Date.parse(a.start), Date.parse(b.start)));

    res.json({ groups, games, attention: attention.slice(0, ATTENTION_CAP) });
  } catch (error) {
    console.error('Manage overview error:', error);
    res.status(500).json({ error: 'Failed to load managed groups and games' });
  }
});

module.exports = router;
