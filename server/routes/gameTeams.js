const express = require('express');
const { authenticateToken } = require('../utils/auth');
const {
  prisma,
  ROLE_LEVEL,
  getRoleLevel,
  mapGameForClient,
} = require('../services/gameService');
const {
  assignManagersToOwnTeams,
  getManagerIdsForGame,
} = require('../services/pickSessionService');

const router = express.Router();

// PUT /api/games/:id/teams - set teams and assignments (Organizer or Manager)
router.put('/:id/teams', authenticateToken, async (req, res) => {
  const gameId = req.params.id;
  const { teams } = req.body || {};
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'Invalid payload: teams must be an array' });
  }

  try {
    const level = await getRoleLevel(gameId, req.user.id);
    if (level < ROLE_LEVEL.MANAGER) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { roles: true },
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const tx = [];
    tx.push(prisma.participation.updateMany({ where: { gameId }, data: { teamId: null } }));
    tx.push(prisma.team.deleteMany({ where: { gameId } }));
    await prisma.$transaction(tx);

    const createdTeams = [];
    for (const t of teams) {
      const name = String(t.name || '').trim();
      const color = String(t.color || '').trim();
      if (!name || !color) continue;
      const created = await prisma.team.create({
        data: {
          gameId,
          name,
          color,
          ...(t.managerId ? { managerId: String(t.managerId) } : {}),
        }
      });
      createdTeams.push({ ...created, playerIds: Array.isArray(t.playerIds) ? t.playerIds : [] });
    }

    for (const ct of createdTeams) {
      if (!ct.playerIds || ct.playerIds.length === 0) continue;
      await prisma.participation.updateMany({
        where: { gameId, userId: { in: ct.playerIds } },
        data: { teamId: ct.id }
      });
    }

    // After any team rewrite, re-seat managers on their own teams when drafting
    // is active (or teams already carry managerId), so they never land on the bench.
    const managerIdsFromPayload = createdTeams
      .map((t) => t.managerId)
      .filter(Boolean)
      .map(String);
    const allManagerIds = await getManagerIdsForGame(gameId, game);
    const shouldSeat =
      !!game.pickDrawExecutedAt ||
      !!game.pickingOpenedAt ||
      managerIdsFromPayload.length > 0;
    if (shouldSeat) {
      const seatIds = managerIdsFromPayload.length
        ? [...new Set([...allManagerIds, ...managerIdsFromPayload])]
        : allManagerIds;
      await assignManagersToOwnTeams(gameId, seatIds);
    }

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        field: true,
        participants: { include: { user: true } },
        roles: { include: { user: true } },
        teams: true
      }
    });
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (e) {
    console.error('Update teams error:', e);
    return res.status(500).json({ error: 'Failed to update teams' });
  }
});

module.exports = router;
