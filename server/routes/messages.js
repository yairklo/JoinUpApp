const express = require('express');
const { authenticateToken } = require('../utils/auth');
const { checkChatPermission } = require('../utils/chatAuth');
const { prisma } = require('../lib/prisma');
const { mapUserToSender } = require('../utils/chatMappers');
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
    // Fetch the newest `take` messages, then flip back to chronological order for clients.
    // Ordering asc + take returned the OLDEST messages, hiding recent ones in busy rooms.
    const newestFirst = await prisma.message.findMany({
      where: { chatRoomId: String(roomId) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
    const rawItems = newestFirst.reverse();

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
        sender: mapUserToSender(m.user),
        replyTo: m.replyTo ? {
          id: m.replyTo.id,
          text: m.replyTo.text,
          userId: m.replyTo.userId,
          senderName: m.replyTo.user?.name || "User",
          sender: mapUserToSender(m.replyTo.user)
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

const REPORT_REASONS = new Set(['OFFENSIVE', 'HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'OTHER']);

// POST /api/messages/:id/report  { reason, details? }
// A participant reports another user's chat message. The report lands in the same
// FlaggedMessage queue the admin moderation page already works (dismiss / remove / ban).
router.post('/:id/report', authenticateToken, async (req, res) => {
  try {
    const reporterId = String(req.user.id);
    const rawReason = String((req.body && req.body.reason) || 'OFFENSIVE').toUpperCase();
    const reason = REPORT_REASONS.has(rawReason) ? rawReason : 'OTHER';
    const details = req.body && req.body.details ? String(req.body.details).slice(0, 500) : null;

    const message = await prisma.message.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, text: true, userId: true, chatRoomId: true, isDeleted: true },
    });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const isAllowed = await checkChatPermission(reporterId, message.chatRoomId);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: You are not a participant of this chat' });
    }
    if (!message.userId || message.userId === reporterId) {
      return res.status(400).json({ error: 'You cannot report this message' });
    }
    if (message.isDeleted) {
      return res.status(400).json({ error: 'Message was already removed' });
    }

    // One open report per reporter per message - repeated taps shouldn't flood the queue.
    const existing = await prisma.flaggedMessage.findFirst({
      where: {
        messageId: message.id,
        status: 'PENDING_REVIEW',
        aiTriggers: { path: ['reporterId'], equals: reporterId },
      },
      select: { id: true },
    });
    if (existing) return res.status(200).json({ ok: true, alreadyReported: true });

    await prisma.flaggedMessage.create({
      data: {
        messageId: message.id,
        content: message.text,
        userId: message.userId,
        status: 'PENDING_REVIEW',
        aiTriggers: {
          source: 'user_report',
          reason,
          details,
          reporterId,
          roomId: message.chatRoomId,
        },
      },
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('Report message error:', e);
    res.status(500).json({ error: 'Failed to report message' });
  }
});

module.exports = router;


