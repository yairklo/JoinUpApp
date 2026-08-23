const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken } = require('../utils/auth');
const { requireAdmin } = require('../utils/admin');

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

module.exports = router;
