const express = require('express');
const { authenticateToken } = require('../utils/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

// List all active series
router.get('/active', async (req, res) => {
  try {
    const seriesList = await prisma.gameSeries.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { subscribers: true } },
      }
    });

    const organizers = await prisma.user.findMany({
      where: { id: { in: seriesList.map(s => s.organizerId) } },
      select: { id: true, name: true, imageUrl: true }
    });

    const results = seriesList.map(s => {
      const org = organizers.find(u => u.id === s.organizerId);
      return {
        id: s.id,
        name: `${s.fieldName} • ${s.time}`,
        fieldName: s.fieldName,
        fieldLocation: s.fieldLocation,
        time: s.time,
        dayOfWeek: s.dayOfWeek,
        type: s.type,
        organizer: {
          id: org?.id || s.organizerId,
          name: org?.name || '',
          avatar: org?.imageUrl || ''
        },
        subscriberCount: s._count.subscribers
      };
    });

    res.json(results);
  } catch (e) {
    console.error('List active series error:', e);
    res.status(500).json({ error: 'Failed to list active series' });
  }
});

// Public: series details (organizer, subscribers, upcoming games)
router.get('/:seriesId', async (req, res) => {
  try {
    console.log('[GET /api/series/:id] Fetching series ID:', req.params?.seriesId, 'url=', req.originalUrl);
    const { seriesId } = req.params;
    let series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });

    // Fallback: if not found, client may have sent a gameId instead of seriesId.
    if (!series) {
      const maybeGame = await prisma.game.findUnique({
        where: { id: seriesId },
        select: { id: true, seriesId: true }
      });
      if (maybeGame && maybeGame.seriesId) {
        series = await prisma.gameSeries.findUnique({ where: { id: maybeGame.seriesId } });
        if (series) {
          console.warn('[GET /api/series/:id] Requested ID was a gameId; resolved seriesId =', maybeGame.seriesId);
        }
      }
    }

    if (!series) return res.status(404).json({ error: 'Series not found' });

    const [organizer, subscribers, upcoming] = await Promise.all([
      prisma.user.findUnique({
        where: { id: series.organizerId },
        select: { id: true, name: true, imageUrl: true }
      }),
      prisma.seriesParticipant.findMany({
        where: { seriesId },
        include: { user: { select: { id: true, name: true, imageUrl: true } } }
      }),
      (async () => {
        const now = new Date();
        return prisma.game.findMany({
          where: { seriesId, start: { gte: now } },
          orderBy: { start: 'asc' },
          take: 10,
          include: { participants: true }
        });
      })()
    ]);

    const upcomingGames = (upcoming || []).map(g => {
      const confirmed = (g.participants || []).filter(p => p.status === 'CONFIRMED').length;
      return {
        id: g.id,
        date: new Date(g.start).toISOString(),
        currentPlayers: confirmed,
        maxPlayers: g.maxPlayers
      };
    });

    const payload = {
      id: series.id,
      name: `${series.fieldName} • ${series.time}`,
      fieldName: series.fieldName,
      fieldLocation: series.fieldLocation,
      time: series.time,
      dayOfWeek: series.dayOfWeek ?? null,
      type: series.type,
      organizer: {
        id: organizer?.id || series.organizerId,
        name: organizer?.name || '',
        avatar: organizer?.imageUrl || ''
      },
      subscribers: (subscribers || []).map(s => ({
        userId: s.userId,
        user: {
          id: s.user?.id || s.userId,
          name: s.user?.name || '',
          avatar: s.user?.imageUrl || ''
        }
      })),
      upcomingGames
    };

    return res.json(payload);
  } catch (e) {
    console.error('Series details error:', e);
    return res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// Subscribe to a series (become a regular)
router.post('/:seriesId/subscribe', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const userId = req.user.id;
    // Ensure series exists
    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });

    await prisma.seriesParticipant.upsert({
      where: { seriesId_userId: { seriesId, userId } },
      update: {},
      create: { seriesId, userId }
    });

    // Optional: add to nearest upcoming instance if not full
    const now = new Date();
    const nextGame = await prisma.game.findFirst({
      where: { seriesId, start: { gte: now } },
      orderBy: { start: 'asc' },
      include: { participants: true }
    });
    if (nextGame) {
      const already = nextGame.participants.find(p => p.userId === userId);
      const confirmedCount = nextGame.participants.filter(p => p.status === 'CONFIRMED').length;
      if (!already && confirmedCount < nextGame.maxPlayers) {
        await prisma.participation.create({
          data: { gameId: nextGame.id, userId, status: 'CONFIRMED' }
        });
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('Series subscribe error:', e);
    return res.status(500).json({ error: 'Failed to subscribe to series' });
  }
});

// Unsubscribe from a series
router.delete('/:seriesId/subscribe', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const userId = req.user.id;
    await prisma.seriesParticipant.deleteMany({
      where: { seriesId, userId }
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('Series unsubscribe error:', e);
    return res.status(500).json({ error: 'Failed to unsubscribe from series' });
  }
});

// Update a series and optionally propagate to future games
router.patch('/:seriesId', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const {
      time,
      fieldId,
      fieldName,
      fieldLocation,
      price,
      maxPlayers,
      dayOfWeek,
      updateFutureGames = true,
    } = req.body || {};

    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    const isAdmin = !!req.user?.isAdmin;
    if (series.organizerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    // Block changing dayOfWeek for existing WEEKLY series in MVP
    const changingDay = typeof dayOfWeek !== 'undefined' && dayOfWeek !== null && series.type === 'WEEKLY';
    if (changingDay) {
      return res.status(400).json({ error: 'Changing dayOfWeek for existing WEEKLY series is not supported yet' });
    }

    const data = {};
    if (typeof time === 'string') data.time = String(time);
    if (typeof fieldId !== 'undefined') data.fieldId = fieldId || null;
    if (typeof fieldName === 'string') data.fieldName = fieldName;
    if (typeof fieldLocation === 'string') data.fieldLocation = fieldLocation;
    if (typeof price !== 'undefined' && !Number.isNaN(Number(price))) data.price = Number(price);
    if (typeof maxPlayers !== 'undefined' && !Number.isNaN(Number(maxPlayers))) data.maxPlayers = Number(maxPlayers);
    // dayOfWeek intentionally blocked when updating existing weekly series (see above)

    const updatedSeries = await prisma.gameSeries.update({
      where: { id: seriesId },
      data
    });

    if (!updateFutureGames) {
      return res.json({ series: updatedSeries });
    }

    // Update future games (>= now) linked to this series
    const now = new Date();
    const futureGames = await prisma.game.findMany({
      where: { seriesId, start: { gte: now } }
    });

    const updates = [];
    for (const g of futureGames) {
      const gd = {};
      if (typeof maxPlayers !== 'undefined' && !Number.isNaN(Number(maxPlayers))) gd.maxPlayers = Number(maxPlayers);
      if (typeof fieldId !== 'undefined') gd.fieldId = fieldId || g.fieldId;
      // Time change for WEEKLY: update only the time portion (HH:MM)
      if (typeof time === 'string' && series.type === 'WEEKLY') {
        const [hh, mm] = String(time).split(':').map(n => parseInt(n, 10));
        if (Number.isInteger(hh) && Number.isInteger(mm)) {
          const newStart = new Date(g.start);
          newStart.setHours(hh, mm, 0, 0);
          gd.start = newStart;
        }
      }
      if (Object.keys(gd).length) {
        updates.push(prisma.game.update({ where: { id: g.id }, data: gd }));
      }
    }
    if (updates.length) await prisma.$transaction(updates);

    return res.json({ series: updatedSeries, updatedGames: updates.length });
  } catch (e) {
    console.error('Series update error:', e);
    return res.status(500).json({ error: 'Failed to update series' });
  }
});

// Delete a series:
// - Delete all future games for this series (>= now)
// - Detach past games (set seriesId=null) to keep history
// - Remove subscribers
// - Delete the series record
router.delete('/:seriesId', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    const isAdmin = !!req.user?.isAdmin;
    if (series.organizerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const now = new Date();
    // Collect future game ids
    const futureGames = await prisma.game.findMany({
      where: { seriesId, start: { gte: now } },
      select: { id: true }
    });
    const futureGameIds = futureGames.map(g => g.id);

    // Delete in safe order to satisfy FKs:
    // 1) participants (due to FK to team and game)
    // 2) roles (FK to game)
    // 3) teams (FK to game)
    // 4) games (future only)
    // 5) detach series from past games
    // 6) remove subscribers
    // 7) delete the series row
    const ops = [];
    if (futureGameIds.length) {
      ops.push(prisma.participation.deleteMany({ where: { gameId: { in: futureGameIds } } }));
      ops.push(prisma.gameRole.deleteMany({ where: { gameId: { in: futureGameIds } } }));
      ops.push(prisma.team.deleteMany({ where: { gameId: { in: futureGameIds } } }));
      ops.push(prisma.game.deleteMany({ where: { id: { in: futureGameIds } } }));
    }
    ops.push(prisma.game.updateMany({ where: { seriesId, start: { lt: now } }, data: { seriesId: null } }));
    ops.push(prisma.seriesParticipant.deleteMany({ where: { seriesId } }));
    ops.push(prisma.gameSeries.delete({ where: { id: seriesId } }));

    await prisma.$transaction(ops);

    return res.json({ ok: true });
  } catch (e) {
    console.error('Series delete error:', e);
    return res.status(500).json({ error: 'Failed to delete series' });
  }
});

module.exports = router;


