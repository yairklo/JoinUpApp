const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken, clerkClient } = require('../utils/auth');
const { requireAdmin } = require('../utils/admin');
const { deleteMessageFromChat } = require('../workers/reviewWorker');

const router = express.Router();

router.get('/flagged-messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.flaggedMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(rows);
  } catch (error) {
    console.error('List flagged messages error:', error);
    res.status(500).json({ error: 'Failed to list flagged messages' });
  }
});

// Mark a flagged message as reviewed with no further action taken.
router.post('/flagged-messages/:id/dismiss', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const row = await prisma.flaggedMessage.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolution: `ADMIN_DISMISSED:${req.user.id}` },
    });
    res.json(row);
  } catch (error) {
    console.error('Dismiss flagged message error:', error);
    res.status(500).json({ error: 'Failed to dismiss flagged message' });
  }
});

// Redact the underlying chat message and mark the flag resolved.
router.post('/flagged-messages/:id/remove-message', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const flagged = await prisma.flaggedMessage.findUnique({ where: { id: req.params.id } });
    if (!flagged) return res.status(404).json({ error: 'Flagged message not found' });

    if (flagged.messageId) {
      await deleteMessageFromChat(flagged.messageId);
    }

    const row = await prisma.flaggedMessage.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolution: `ADMIN_REMOVED:${req.user.id}` },
    });
    res.json(row);
  } catch (error) {
    console.error('Remove flagged message error:', error);
    res.status(500).json({ error: 'Failed to remove message' });
  }
});

// Suspend an account: blocks future authenticateToken calls (HTTP + socket).
router.post('/users/:id/ban', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Cannot ban your own account' });
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null;
    await clerkClient.users.updateUserMetadata(targetId, {
      privateMetadata: {
        isBanned: true,
        banReason: reason,
        bannedAt: new Date().toISOString(),
        bannedBy: req.user.id,
      },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

router.post('/users/:id/unban', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await clerkClient.users.updateUserMetadata(req.params.id, {
      privateMetadata: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        bannedBy: null,
      },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

module.exports = router;
