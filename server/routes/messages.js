const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../utils/auth');

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/messages?roomId=abc&limit=100
router.get('/', async (req, res) => {
  try {
    const { roomId, limit } = req.query;
    if (!roomId) return res.status(400).json({ error: 'roomId is required' });
    const take = Math.min(Number(limit) || 100, 500);
    const items = await prisma.message.findMany({
      where: { roomId: String(roomId) },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        replyTo: { select: { id: true, text: true, userId: true } },
        reactions: true
      }
    });

    const mappedItems = items.map(m => {
      // Aggregate reactions
      const reactions = {};
      if (m.reactions) {
        for (const r of m.reactions) {
          if (!reactions[r.emoji]) {
            reactions[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
          }
          reactions[r.emoji].count += 1;
          reactions[r.emoji].userIds.push(r.userId);
        }
      }

      return {
        id: m.id,
        text: m.text,
        roomId: m.roomId,
        userId: m.userId || null,
        ts: m.createdAt,
        replyTo: m.replyTo ? {
          id: m.replyTo.id,
          text: m.replyTo.text,
          userId: m.replyTo.userId,
          senderName: "User" // Placeholder as we don't join User table here
        } : undefined,
        reactions: reactions
      };
    });

    res.json(mappedItems);
  } catch (e) {
    console.error('Get messages error:', e);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /api/messages  { roomId, text, userId? }
router.post('/', async (req, res) => {
  try {
    const { roomId, text, userId } = req.body || {};
    if (!roomId || !text) return res.status(400).json({ error: 'roomId and text are required' });
    const saved = await prisma.message.create({ data: { roomId: String(roomId), text: String(text), userId: userId ? String(userId) : null } });
    res.status(201).json({ id: saved.id, roomId: saved.roomId, text: saved.text, userId: saved.userId, ts: saved.createdAt });
  } catch (e) {
    console.error('Create message error:', e);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

module.exports = router;


