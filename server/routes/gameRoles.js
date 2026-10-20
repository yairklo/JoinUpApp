const express = require('express');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const {
  prisma,
  ROLE_LEVEL,
  roleToLevel,
  getRoleLevel,
} = require('../services/gameService');

const { getGameAccess } = require('../utils/friendsOnlyAccess');
const { publicDisplayName } = require('../utils/publicName');
const { getAgeInJerusalem } = require('../shared/ageGate');

const router = express.Router();

// List roles for a game
router.get('/:id/roles', attachOptionalUser, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: { roles: { include: { user: true } } }
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    // Same friends-only rules as GET /api/games/:id: outsiders get no manager list, and
    // logged-out viewers never see minors.
    const access = await getGameAccess(prisma, game, req.user?.id, { isAdmin: !!req.user?.isAdmin });
    if (access === 'NONE') {
      return res.status(403).json({ error: 'This game is for friends only', code: 'GAME_FRIENDS_ONLY' });
    }
    const managers = access === 'REQUEST' ? [] : (game.roles || [])
      .filter(r => r.role !== 'ORGANIZER')
      .filter(r => {
        if (req.user?.id) return true;
        const age = getAgeInJerusalem(r.user?.birthDate);
        return !(age !== null && age < 18);
      })
      .map(r => ({ id: r.userId, name: publicDisplayName(r.user?.name), avatar: r.user?.imageUrl || null, role: r.role }));
    return res.json({ organizerId: game.organizerId, managers });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get roles' });
  }
});

// Add or update a manager (organizer or existing manager only)
router.post('/:id/roles', authenticateToken, async (req, res) => {
  try {
    const { userId, role } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const gameId = req.params.id;

    const actorLevel = await getRoleLevel(gameId, req.user.id);
    if (actorLevel < ROLE_LEVEL.MODERATOR) return res.status(403).json({ error: 'Not allowed' });

    const isParticipant = await prisma.participation.findFirst({ where: { gameId, userId } });
    if (!isParticipant) return res.status(400).json({ error: 'Target user is not a participant' });

    const requestedRole = (role && ['MANAGER', 'MODERATOR', 'CAPTAIN'].includes(String(role))) ? String(role).toUpperCase() : 'MANAGER';
    const requestedLevel = roleToLevel(requestedRole);
    const targetLevel = await getRoleLevel(gameId, userId);

    if (targetLevel >= actorLevel) {
      return res.status(403).json({ error: 'Cannot modify a peer or higher role' });
    }
    if (requestedLevel > actorLevel) {
      return res.status(403).json({ error: 'Cannot assign a higher role than your own' });
    }
    if (requestedRole === 'ORGANIZER') {
      return res.status(400).json({ error: 'Cannot assign organizer via this endpoint' });
    }

    await prisma.gameRole.upsert({
      where: { gameId_userId: { gameId, userId } },
      create: { gameId, userId, role: requestedRole },
      update: { role: requestedRole },
    });

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { roles: { include: { user: true } } }
    });
    const managers = (game.roles || [])
      .filter(r => r.role !== 'ORGANIZER')
      .map(r => ({ id: r.userId, name: r.user?.name || null, avatar: r.user?.imageUrl || null, role: r.role }));
    return res.json({ organizerId: game.organizerId, managers });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to add manager' });
  }
});

// Remove a manager
router.delete('/:id/roles/:userId', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;

    const actorLevel = await getRoleLevel(gameId, req.user.id);
    if (actorLevel < ROLE_LEVEL.MODERATOR) return res.status(403).json({ error: 'Not allowed' });

    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { organizerId: true } });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.organizerId === targetUserId) {
      return res.status(400).json({ error: 'Cannot remove organizer role' });
    }

    const targetLevel = await getRoleLevel(gameId, targetUserId);
    if (targetLevel >= actorLevel) {
      return res.status(403).json({ error: 'Cannot modify a peer or higher role' });
    }

    await prisma.gameRole.deleteMany({ where: { gameId, userId: targetUserId } });

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { roles: { include: { user: true } } }
    });
    const managers = (updated.roles || [])
      .filter(r => r.role !== 'ORGANIZER')
      .map(r => ({ id: r.userId, name: r.user?.name || null, avatar: r.user?.imageUrl || null, role: r.role }));
    return res.json({ organizerId: updated.organizerId, managers });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to remove manager' });
  }
});

module.exports = router;
