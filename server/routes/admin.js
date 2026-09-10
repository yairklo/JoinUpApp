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

// Block/unblock a user from commenting or reporting issues on fields — narrower than
// the full-account `isBanned` ban above (they keep normal access to everything else).
router.post('/users/:id/block-field-social', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { blockedFromFieldSocial: true } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Block user from field social error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

router.post('/users/:id/unblock-field-social', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { blockedFromFieldSocial: false } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Unblock user from field social error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// GET /api/admin/field-comments - Recent field comments across all fields, for moderation.
router.get('/field-comments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.fieldComment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, imageUrl: true, blockedFromFieldSocial: true } },
        field: { select: { id: true, name: true } },
      },
    });
    res.json(rows.map((c) => ({
      id: c.id,
      fieldId: c.fieldId,
      fieldName: c.field?.name || '',
      parentId: c.parentId,
      text: c.text,
      createdAt: c.createdAt,
      user: c.user,
    })));
  } catch (error) {
    console.error('List field comments error:', error);
    res.status(500).json({ error: 'Failed to list field comments' });
  }
});

// GET /api/admin/field-issues - Recent field issue reports across all fields, for moderation.
router.get('/field-issues', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.fieldIssueReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, imageUrl: true, blockedFromFieldSocial: true } },
        field: { select: { id: true, name: true } },
      },
    });
    res.json(rows.map((i) => ({
      id: i.id,
      fieldId: i.fieldId,
      fieldName: i.field?.name || '',
      parentId: i.parentId,
      category: i.category,
      description: i.description,
      status: i.status,
      createdAt: i.createdAt,
      user: i.user,
    })));
  } catch (error) {
    console.error('List field issues error:', error);
    res.status(500).json({ error: 'Failed to list field issues' });
  }
});

// GET /api/admin/field-comment-flags - Pending user reports (offensive/false/spam) on comments.
router.get('/field-comment-flags', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.fieldCommentFlag.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        reporter: { select: { id: true, name: true } },
        comment: {
          include: {
            user: { select: { id: true, name: true, imageUrl: true, blockedFromFieldSocial: true } },
            field: { select: { id: true, name: true } },
          },
        },
      },
    });
    res.json(rows.map((f) => ({
      id: f.id,
      reason: f.reason,
      details: f.details,
      createdAt: f.createdAt,
      reporter: f.reporter,
      comment: {
        id: f.comment.id,
        fieldId: f.comment.fieldId,
        fieldName: f.comment.field?.name || '',
        text: f.comment.text,
        user: f.comment.user,
      },
    })));
  } catch (error) {
    console.error('List field comment flags error:', error);
    res.status(500).json({ error: 'Failed to list field comment flags' });
  }
});

// POST /api/admin/field-comment-flags/:id/dismiss - Mark a comment flag reviewed, no action taken.
router.post('/field-comment-flags/:id/dismiss', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.fieldCommentFlag.update({ where: { id: req.params.id }, data: { status: 'DISMISSED' } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Dismiss field comment flag error:', error);
    res.status(500).json({ error: 'Failed to dismiss flag' });
  }
});

// GET /api/admin/field-issue-flags - Pending user reports on field issue reports/replies.
router.get('/field-issue-flags', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.fieldIssueReportFlag.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        reporter: { select: { id: true, name: true } },
        issue: {
          include: {
            user: { select: { id: true, name: true, imageUrl: true, blockedFromFieldSocial: true } },
            field: { select: { id: true, name: true } },
          },
        },
      },
    });
    res.json(rows.map((f) => ({
      id: f.id,
      reason: f.reason,
      details: f.details,
      createdAt: f.createdAt,
      reporter: f.reporter,
      issue: {
        id: f.issue.id,
        fieldId: f.issue.fieldId,
        fieldName: f.issue.field?.name || '',
        category: f.issue.category,
        description: f.issue.description,
        user: f.issue.user,
      },
    })));
  } catch (error) {
    console.error('List field issue flags error:', error);
    res.status(500).json({ error: 'Failed to list field issue flags' });
  }
});

// POST /api/admin/field-issue-flags/:id/dismiss - Mark an issue flag reviewed, no action taken.
router.post('/field-issue-flags/:id/dismiss', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.fieldIssueReportFlag.update({ where: { id: req.params.id }, data: { status: 'DISMISSED' } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Dismiss field issue flag error:', error);
    res.status(500).json({ error: 'Failed to dismiss flag' });
  }
});

// GET /api/admin/support-messages - list bug reports / messages, newest first
router.get('/support-messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.supportMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, name: true, imageUrl: true } } },
    });
    res.json(rows);
  } catch (error) {
    console.error('List support messages error:', error);
    res.status(500).json({ error: 'Failed to list support messages' });
  }
});

// POST /api/admin/support-messages/:id/resolve - mark a support message resolved
router.post('/support-messages/:id/resolve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const updated = await prisma.supportMessage.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    res.json(updated);
  } catch (error) {
    console.error('Resolve support message error:', error);
    res.status(500).json({ error: 'Failed to resolve support message' });
  }
});

module.exports = router;
