const express = require('express');
const { authenticateToken } = require('../utils/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

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

module.exports = router;


