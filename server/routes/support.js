const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken } = require('../utils/auth');

const router = express.Router();
const MAX_MESSAGE_LENGTH = 2000;
const VALID_TYPES = ['BUG', 'FEEDBACK'];

// POST /api/support - submit a bug report or general message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const type = String(req.body?.type || '').toUpperCase();
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 300) : null;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(', ')}` });
    }
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `message must be up to ${MAX_MESSAGE_LENGTH} characters` });
    }

    const supportMessage = await prisma.supportMessage.create({
      data: { userId: req.user.id, type, message, context: context || null, status: 'OPEN' },
    });
    res.status(201).json(supportMessage);
  } catch (error) {
    console.error('Create support message error:', error);
    res.status(500).json({ error: 'Failed to submit message' });
  }
});

module.exports = router;
