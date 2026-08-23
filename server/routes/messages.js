const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../utils/auth');
const { checkChatPermission } = require('../utils/chatAuth');

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/messages?roomId=abc&limit=100
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { roomId, limit } = req.query;
    if (!roomId) return res.status(400).json({ error: 'roomId is required' });

    // Security Check
    const isAllowed = await checkChatPermission(req.user.id, roomId);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: You are not a participant of this chat' });
    }

    const take = Math.min(Number(limit) || 100, 500);
    const rawItems = await prisma.message.findMany({
      where: { chatRoomId: String(roomId) },
      orderBy: { createdAt: 'asc' },
      take,
      include: {
        user: { select: { id: true, name: true, imageUrl: true } },
        replyTo: {
          include: {
            user: { select: { id: true, name: true, imageUrl: true } }
          }
        },
        reactions: true
      }
    });

    const items = rawItems.filter(m => m.status !== 'blocked' || m.userId === req.user.id);

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
        roomId: m.chatRoomId, // Map back to roomId for client compatibility
        userId: m.userId || null,
        ts: m.createdAt,
        senderName: m.user?.name || undefined,
        sender: m.user
          ? { id: m.user.id, name: m.user.name, image: m.user.imageUrl }
          : undefined,
        replyTo: m.replyTo ? {
          id: m.replyTo.id,
          text: m.replyTo.text,
          userId: m.replyTo.userId,
          senderName: m.replyTo.user?.name || "User",
          sender: m.replyTo.user // Include the object too for consistency
        } : undefined,
        reactions: reactions,
        status: m.status,
        isEdited: m.isEdited,
        isDeleted: m.isDeleted
      };
    });

    res.json(mappedItems);
  } catch (e) {
    console.error('Get messages error:', e);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /api/messages  { roomId, text }
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { roomId, text } = req.body || {};
    if (!roomId || !text) return res.status(400).json({ error: 'roomId and text are required' });

    const isAllowed = await checkChatPermission(req.user.id, String(roomId));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: You are not a participant of this chat' });
    }

    const saved = await prisma.message.create({
      data: {
        chatRoomId: String(roomId),
        text: String(text),
        userId: req.user.id,
      },
    });
    res.status(201).json({ id: saved.id, roomId: saved.chatRoomId, text: saved.text, userId: saved.userId, ts: saved.createdAt });
  } catch (e) {
    console.error('Create message error:', e);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

module.exports = router;


