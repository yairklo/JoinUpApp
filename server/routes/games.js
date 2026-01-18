const express = require('express');
const dataManager = require('../utils/dataManager');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { PrismaClient, SportType } = require('@prisma/client');
const prisma = new PrismaClient();


function mapGameForClient(game) {
  if (!game) return game;
  const start = new Date(game.start);
  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, '0');
  const dd = String(start.getDate()).padStart(2, '0');
  const hh = String(start.getHours()).padStart(2, '0');
  const mi = String(start.getMinutes()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;
  const time = `${hh}:${mi}`;
  const allParts = Array.isArray(game?.participants) ? game.participants : [];
  const confirmed = allParts.filter(p => p.status === 'CONFIRMED');
  const waitlisted = allParts.filter(p => p.status === 'WAITLISTED');
  const totalSignups = allParts.length;
  const confirmedCount = confirmed.length;
  const waitlistCount = waitlisted.length;
  const now = new Date();
  const lotteryAtIso = game.lotteryAt ? new Date(game.lotteryAt).toISOString() : null;
  const lotteryPending = !!game.lotteryEnabled && !game.lotteryExecutedAt && !!game.lotteryAt && now < new Date(game.lotteryAt);
  const overbooked = !!game.lotteryEnabled && !game.lotteryExecutedAt && totalSignups > game.maxPlayers;
  const participants = confirmed.map(p => ({
    id: p.userId,
    name: p.user?.name || null,
    avatar: p.user?.imageUrl || null,
    teamId: p.teamId || null
  }));
  const waitlistParticipants = waitlisted.map(p => ({
    id: p.userId,
    name: p.user?.name || null,
    avatar: p.user?.imageUrl || null
  }));
  const managers = (game.roles || [])
    .filter(r => r.role !== 'ORGANIZER')
    .map(r => ({
      id: r.userId,
      name: r.user?.name || null,
      avatar: r.user?.imageUrl || null,
      role: r.role
    }));
  const teams = (game?.teams ? game.teams : []).map(t => {
    const playerIds = allParts
      .filter(p => p && p.teamId === t.id)
      .map(p => p.userId)
      .filter(Boolean);
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      playerIds: playerIds || []
    };
  });
  return {
    id: game.id,
    title: game.title || null,
    seriesId: game.seriesId || null,
    fieldId: game.fieldId,
    fieldName: game.field?.name || '',
    fieldLocation: game.field?.location || '',
    isFriendsOnly: !!game.isFriendsOnly,
    friendsOnlyUntil: game.friendsOnlyUntil ? new Date(game.friendsOnlyUntil).toISOString() : null,
    lotteryEnabled: !!game.lotteryEnabled,
    lotteryAt: lotteryAtIso,
    organizerInLottery: !!game.organizerInLottery,
    fieldLat: typeof game.field?.lat === 'number' ? game.field.lat : null,
    fieldLng: typeof game.field?.lng === 'number' ? game.field.lng : null,
    customLat: typeof game.customLat === 'number' ? game.customLat : null,
    customLng: typeof game.customLng === 'number' ? game.customLng : null,
    customLocation: game.customLocation || null,
    date,
    time,
    duration: game.duration,
    maxPlayers: game.maxPlayers,
    teamSize: game.teamSize || null,
    price: game.price || null,
    currentPlayers: confirmedCount,
    totalSignups,
    confirmedCount,
    waitlistCount,
    lotteryPending,
    overbooked,
    description: game.description || '',
    isOpenToJoin: game.isOpenToJoin,
    participants: participants || [],
    waitlistParticipants: waitlistParticipants || [],
    organizerId: game.organizerId,
    managers: managers || [],
    managers: managers || [],
    teams: teams || [],
    sport: game.sport,
    city: game.field?.city || null,
    registrationOpensAt: game.registrationOpensAt ? new Date(game.registrationOpensAt).toISOString() : null,
    chatRoomId: game.id
  };
}

// Deduplicate games by seriesId, keeping the first occurrence (nearest upcoming)
function deduplicateSeriesGames(games) {
  const seenSeries = new Set();
  return games.filter(g => {
    if (!g.seriesId) return true;
    if (seenSeries.has(g.seriesId)) return false;
    seenSeries.add(g.seriesId);
    return true;
  });
}

const router = express.Router();

// Build visibility where-clause depending on viewerId
function buildVisibilityWhere(viewerId) {
  if (!viewerId) {
    return {
      OR: [
        { isFriendsOnly: false },
        { friendsOnlyUntil: { lte: new Date() } }
      ]
    };
  }
  return {
    OR: [
      { isFriendsOnly: false },
      { friendsOnlyUntil: { lte: new Date() } },
      { organizerId: viewerId },
      { participants: { some: { userId: viewerId } } },
      {
        organizer: {
          OR: [
            { friendshipsA: { some: { userBId: viewerId } } },
            { friendshipsB: { some: { userAId: viewerId } } },
          ],
        },
      },
    ],
  };
}

// Public games only (no auth, no friends-only)
router.get('/public', async (req, res) => {
  try {
    const { fieldId, date, isOpenToJoin } = req.query;
    const where = {
      AND: [
        {
          OR: [
            { isFriendsOnly: false },
            { friendsOnlyUntil: { lte: new Date() } }
          ]
        }
      ]
    };

    if (fieldId) where.AND.push({ fieldId: String(fieldId) });
    if (typeof isOpenToJoin !== 'undefined') where.AND.push({ isOpenToJoin: String(isOpenToJoin) === 'true' });
    if (date) {
      const d = new Date(String(date));
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      where.AND.push({ start: { gte: startOfDay, lte: endOfDay } });
    }

    const games = await prisma.game.findMany({
      where,
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });

    const deduped = deduplicateSeriesGames(games);
    res.json(deduped.map(mapGameForClient));
  } catch (error) {
    console.error('Public games error:', error);
    res.status(500).json({ error: 'Failed to get public games' });
  }
});

// My games (authenticated user's upcoming games)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const games = await prisma.game.findMany({
      where: {
        AND: [
          { start: { gte: now } },
          {
            OR: [
              { participants: { some: { userId } } },
              { organizerId: userId }
            ]
          }
        ]
      },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });

    const deduped = deduplicateSeriesGames(games);
    res.json(deduped.map(mapGameForClient));
  } catch (error) {
    console.error('My games error:', error);
    res.status(500).json({ error: 'Failed to fetch my games' });
  }
});

// Games with friends
router.get('/friends', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // Find friends
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        friendshipsA: { select: { userBId: true } },
        friendshipsB: { select: { userAId: true } },
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const friendIds = [
      ...(user.friendshipsA || []).map(f => f.userBId),
      ...(user.friendshipsB || []).map(f => f.userAId)
    ];

    if (friendIds.length === 0) {
      return res.json([]);
    }

    const visibility = buildVisibilityWhere(userId);
    const now = new Date(); // Future games
    const games = await prisma.game.findMany({
      where: {
        AND: [
          visibility,
          { start: { gte: now } },
          { participants: { some: { userId: { in: friendIds } } } },
          { participants: { none: { userId: userId } } }
        ]
      },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });

    const deduped = deduplicateSeriesGames(games);
    res.json(deduped.map(mapGameForClient));
  } catch (error) {
    console.error('Friends games error:', error);
    res.status(500).json({ error: 'Failed to find games with friends' });
  }
});

// Games by city (future)
router.get('/city', attachOptionalUser, async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) return res.json([]);

    const visibility = buildVisibilityWhere(req.user?.id);
    const now = new Date();
    const games = await prisma.game.findMany({
      where: {
        AND: [
          visibility,
          { start: { gte: now } },
          { field: { city: { equals: String(city), mode: 'insensitive' } } }
        ]
      },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });

    const deduped = deduplicateSeriesGames(games);
    res.json(deduped.map(mapGameForClient));
  } catch (error) {
    console.error('City games error:', error);
    res.status(500).json({ error: 'Failed to get games by city' });
  }
});

// --- Game roles (managers) ---
const ROLE_LEVEL = { NONE: 0, MODERATOR: 1, MANAGER: 2, ORGANIZER: 3 };
function roleToLevel(role) {
  return ROLE_LEVEL[String(role || 'NONE').toUpperCase()] ?? 0;
}
async function getRoleLevel(gameId, userId) {
  if (!userId) return ROLE_LEVEL.NONE;
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { organizerId: true } });
  if (!game) return ROLE_LEVEL.NONE;
  if (game.organizerId === userId) return ROLE_LEVEL.ORGANIZER;
  const r = await prisma.gameRole.findFirst({ where: { gameId, userId } });
  return roleToLevel(r?.role);
}
async function canManageGame(gameId, userId) {
  const level = await getRoleLevel(gameId, userId);
  return level >= ROLE_LEVEL.MODERATOR;
}

// List roles for a game
router.get('/:id/roles', attachOptionalUser, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: { roles: { include: { user: true } } }
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const managers = (game.roles || [])
      .filter(r => r.role !== 'ORGANIZER')
      .map(r => ({ id: r.userId, name: r.user?.name || null, avatar: r.user?.imageUrl || null, role: r.role }));
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

    // Actor's role level and target's current level
    const actorLevel = await getRoleLevel(gameId, req.user.id);
    if (actorLevel < ROLE_LEVEL.MODERATOR) return res.status(403).json({ error: 'Not allowed' });

    // Ensure target is a participant
    const isParticipant = await prisma.participation.findFirst({ where: { gameId, userId } });
    if (!isParticipant) return res.status(400).json({ error: 'Target user is not a participant' });

    // Prevent assigning organizer role via this endpoint, and enforce hierarchy
    const requestedRole = (role && ['MANAGER', 'MODERATOR'].includes(String(role))) ? String(role).toUpperCase() : 'MANAGER';
    const requestedLevel = roleToLevel(requestedRole);

    // Target current level
    const targetLevel = await getRoleLevel(gameId, userId);

    // Actor can only affect users strictly below them now
    if (targetLevel >= actorLevel) {
      return res.status(403).json({ error: 'Cannot modify a peer or higher role' });
    }
    // Actor cannot assign a role higher than their own
    if (requestedLevel > actorLevel) {
      return res.status(403).json({ error: 'Cannot assign a higher role than your own' });
    }
    // Do not allow organizer assignment here
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

    // Do not allow removing organizer via roles
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { organizerId: true } });
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.organizerId === targetUserId) {
      return res.status(400).json({ error: 'Cannot remove organizer role' });
    }

    // Hierarchy: can only remove roles below you
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

// Convert a standalone game into a recurring series and generate future instances
router.post('/:id/recurrence', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { copyParticipants } = req.body || {};

    const existing = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: true, roles: true }
    });
    if (!existing) return res.status(404).json({ error: 'Game not found' });
    if (existing.seriesId) return res.status(400).json({ error: 'Game is already part of a series' });

    // Auth: organizer or admin
    const level = await getRoleLevel(gameId, req.user.id);
    const isAdmin = !!req.user?.isAdmin;
    if (level < ROLE_LEVEL.ORGANIZER && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const start = new Date(existing.start);
    const hh = String(start.getHours()).padStart(2, '0');
    const mi = String(start.getMinutes()).padStart(2, '0');
    const time = `${hh}:${mi}`;

    // Create series
    const series = await prisma.gameSeries.create({
      data: {
        title: existing.title,
        organizerId: existing.organizerId,
        fieldId: existing.fieldId || null,
        fieldName: existing.field?.name || '',
        fieldLocation: existing.field?.location || '',
        price: existing.field?.price ?? 0,
        maxPlayers: existing.maxPlayers,
        dayOfWeek: start.getDay(),
        time,
        duration: Number(existing.duration),
        isActive: true,
        sport: existing.sport,
      },
    });

    // Optionally copy current participants into SeriesParticipant (as regulars)
    if (copyParticipants) {
      const uniqueUserIds = Array.from(new Set((existing.participants || []).map(p => p.userId).filter(Boolean)));
      const upserts = uniqueUserIds.map(uid =>
        prisma.seriesParticipant.upsert({
          where: { seriesId_userId: { seriesId: series.id, userId: uid } },
          update: {},
          create: { seriesId: series.id, userId: uid }
        })
      );
      if (upserts.length) await prisma.$transaction(upserts);
    }

    // Link existing game to the series
    const updated = await prisma.game.update({
      where: { id: gameId },
      data: { seriesId: series.id },
      include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
    });

    // Fetch subscribers for generation
    const subs = await prisma.seriesParticipant.findMany({
      where: { seriesId: series.id },
      select: { userId: true }
    });
    const subscriberIds = Array.from(new Set((subs || []).map(s => s.userId).filter(Boolean)));

    // Generate next 4 weekly games AFTER the existing one
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const createOps = [];
    for (let i = 1; i <= 4; i++) {
      const occStart = new Date(start.getTime() + i * oneWeekMs);
      // Build participants: organizer + series subscribers within capacity
      const maxCap = Number(existing.maxPlayers);
      const participantsCreate = [];
      // Organizer first (use existing.organizerId)
      participantsCreate.push({
        userId: existing.organizerId,
        status: existing.organizerInLottery ? 'WAITLISTED' : 'CONFIRMED'
      });
      const alreadyConfirmed = existing.organizerInLottery ? 0 : 1;
      let remainingSlots = Math.max(0, maxCap - alreadyConfirmed);
      for (const uid of subscriberIds) {
        if (uid === existing.organizerId) continue;
        if (remainingSlots > 0) {
          participantsCreate.push({ userId: uid, status: 'CONFIRMED' });
          remainingSlots -= 1;
        } else {
          participantsCreate.push({ userId: uid, status: 'WAITLISTED' });
        }
      }

      createOps.push(
        prisma.game.create({
          data: {
            title: existing.title,
            fieldId: existing.fieldId,
            seriesId: series.id,
            start: occStart,
            duration: existing.duration,
            maxPlayers: existing.maxPlayers,
            isOpenToJoin: existing.isOpenToJoin,
            isFriendsOnly: existing.isFriendsOnly,
            lotteryEnabled: existing.lotteryEnabled,
            ...(existing.lotteryEnabled && existing.lotteryAt ? { lotteryAt: new Date(existing.lotteryAt) } : {}),
            organizerInLottery: existing.organizerInLottery,
            description: existing.description || '',
            organizerId: existing.organizerId,
            participants: { create: participantsCreate },
            roles: { create: { userId: existing.organizerId, role: 'ORGANIZER' } }
          },
          include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
        })
      );
    }

    const createdGames = await prisma.$transaction(createOps);
    return res.json({
      game: mapGameForClient(updated),
      created: createdGames.map(mapGameForClient),
      seriesId: series.id
    });
  } catch (e) {
    console.error('Convert to series error:', e);
    return res.status(500).json({ error: 'Failed to convert game to series' });
  }
});

// PATCH /api/games/:id - partial update (e.g., update time for a single game)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { time, date, maxPlayers, sport, registrationOpensAt, title, friendsOnlyUntil, isFriendsOnly, teamSize } = req.body || {};

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true, team: true } }, roles: { include: { user: true } }, teams: true }
    });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Only organizer or manager+ can change game time
    const level = await getRoleLevel(gameId, req.user.id);
    const isOrganizer = game.organizerId === req.user.id;
    if (!isOrganizer && level < ROLE_LEVEL.MANAGER) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const updates = {};
    if (typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)) {
      const [hhStr, mmStr] = time.split(':');
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);
      if (Number.isInteger(hh) && Number.isInteger(mm)) {
        const newStart = new Date(game.start);
        newStart.setHours(hh, mm, 0, 0);
        updates['start'] = newStart;
      }
    }
    if (typeof date === 'string') {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        const newStart = new Date(updates['start'] || game.start);
        newStart.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        updates['start'] = newStart;
      }
    }

    if (maxPlayers !== undefined) {
      const mp = parseInt(maxPlayers, 10);
      if (!isNaN(mp) && mp > 0) {
        updates['maxPlayers'] = mp;
        // If reducing capacity below current signups, we might need to handle waitlist logic here
        // For now this is a simple update
      }
    }

    if (teamSize !== undefined) {
      const ts = parseInt(teamSize, 10);
      if (!isNaN(ts) && ts > 0) {
        updates['teamSize'] = ts;
      } else if (teamSize === null) {
        updates['teamSize'] = null;
      }
    }

    if (typeof sport === 'string') {
      const validSports = Object.values(SportType);
      const s = sport.toUpperCase();
      if (validSports.includes(s)) {
        updates['sport'] = s;
      }
    }

    if (registrationOpensAt !== undefined) {
      updates['registrationOpensAt'] = registrationOpensAt ? new Date(registrationOpensAt) : null;
    }

    if (typeof title !== 'undefined') {
      updates['title'] = title;
    }

    if (friendsOnlyUntil !== undefined) {
      updates['friendsOnlyUntil'] = friendsOnlyUntil ? new Date(friendsOnlyUntil) : null;
    }

    if (typeof isFriendsOnly === 'boolean') {
      updates['isFriendsOnly'] = isFriendsOnly;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await prisma.game.update({
      where: { id: gameId },
      data: updates,
      include: { field: true, participants: { include: { user: true, team: true } }, roles: { include: { user: true } }, teams: true }
    });

    return res.json(mapGameForClient(updated));
  } catch (e) {
    console.error('Patch game error:', e);
    return res.status(500).json({ error: 'Failed to update game' });
  }
});

// Get all games
router.get('/', attachOptionalUser, async (req, res) => {
  try {
    const visibility = buildVisibilityWhere(req.user?.id);
    const games = await prisma.game.findMany({
      where: visibility,
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });
    res.json(games.map(mapGameForClient));
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ error: 'Failed to get games' });
  }
});

// Search games
router.get('/search', attachOptionalUser, async (req, res) => {
  try {
    const { fieldId, date, isOpenToJoin } = req.query;
    const where = {};
    if (fieldId) where.fieldId = String(fieldId);
    if (typeof isOpenToJoin !== 'undefined') where.isOpenToJoin = String(isOpenToJoin) === 'true';
    if (date) {
      const d = new Date(String(date));
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      where.start = { gte: startOfDay, lte: endOfDay };
    }
    const visibility = buildVisibilityWhere(req.user?.id);
    const games = await prisma.game.findMany({
      where: { AND: [visibility, where] },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });

    const deduped = deduplicateSeriesGames(games);
    res.json(deduped.map(mapGameForClient));
  } catch (error) {
    console.error('Search games error:', error);
    res.status(500).json({ error: 'Failed to search games' });
  }
});

// Get games by field
router.get('/field/:fieldId', attachOptionalUser, async (req, res) => {
  try {
    const { fieldId } = req.params;
    const visibility = buildVisibilityWhere(req.user?.id);
    const games = await prisma.game.findMany({
      where: { AND: [visibility, { fieldId }] },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });
    res.json(games.map(mapGameForClient));
  } catch (error) {
    console.error('Get games by field error:', error);
    res.status(500).json({ error: 'Failed to get games by field' });
  }
});

// Get games by date
router.get('/date/:date', attachOptionalUser, async (req, res) => {
  try {
    const d = new Date(String(req.params.date));
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const visibility = buildVisibilityWhere(req.user?.id);
    const games = await prisma.game.findMany({
      where: { AND: [visibility, { start: { gte: startOfDay, lte: endOfDay } }] },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });
    res.json(games.map(mapGameForClient));
  } catch (error) {
    console.error('Get games by date error:', error);
    res.status(500).json({ error: 'Failed to get games by date' });
  }
});

// Games today in a specific city (by Field.city)
router.get('/today-city', attachOptionalUser, async (req, res) => {
  try {
    const { city } = req.query;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const where = {
      start: { gte: startOfDay, lte: endOfDay },
      ...(city ? { field: { city: { equals: String(city), mode: 'insensitive' } } } : {}),
    };
    const visibility = buildVisibilityWhere(req.user?.id);
    const games = await prisma.game.findMany({
      where: { AND: [visibility, where] },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });
    res.json(games.map(mapGameForClient));
  } catch (error) {
    console.error('Today-city games error:', error);
    res.status(500).json({ error: 'Failed to get games' });
  }
});

// Create new game
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      fieldId,
      newField, // optional: { name, location }
      date,
      time,
      duration,
      maxPlayers,
      isOpenToJoin,
      isFriendsOnly,
      lotteryEnabled,
      lotteryAt,
      organizerInLottery,
      description,
      recurrence,
      customLng,
      customLocation,
      sport,
      registrationOpensAt,
      title,
      friendsOnlyUntil,
      teamSize,
      price,
      customLat
    } = req.body;
    const latNum = typeof customLat === 'undefined' ? NaN : parseFloat(String(customLat));
    const lngNum = typeof customLng === 'undefined' ? NaN : parseFloat(String(customLng));
    const hasFieldId = !!fieldId;
    const hasNewFieldText = !!(newField && (String(newField.name || '').trim() || String(newField.location || '').trim()));
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const hasDate = !!date;
    const hasTime = !!time;
    const hasMaxPlayers = !!maxPlayers;

    if (!(hasFieldId || hasNewFieldText || hasCoords) || !hasDate || !hasTime || !hasMaxPlayers) {
      console.warn('Create game validation failed', {
        bodyKeys: Object.keys(req.body || {}),
        fieldId,
        hasFieldId,
        hasNewFieldText,
        hasCoords,
        latNum,
        lngNum,
        hasDate,
        hasTime,
        hasMaxPlayers,
      });
      return res.status(400).json({
        error: 'Missing required fields',
        details: { hasFieldId, hasNewFieldText, hasCoords, hasDate, hasTime, hasMaxPlayers }
      });
    }

    let useFieldId = fieldId;

    // If client requested to create a new field inline (no admin requirement here)
    // If client requested to create a new field inline or provided only coordinates,
    // create a minimal field (unlisted) to attach the game to.
    if (!useFieldId && (newField || (Number.isFinite(latNum) && Number.isFinite(lngNum)))) {
      const typeUpper = 'OPEN';
      const fallbackCoords = (Number.isFinite(latNum) && Number.isFinite(lngNum))
        ? `${latNum.toFixed(5)}, ${lngNum.toFixed(5)}`
        : '';
      const name = (newField?.name && String(newField.name).trim()) || (customLocation && String(customLocation).trim()) || `Custom spot ${fallbackCoords}`;
      const location = (newField?.location && String(newField.location).trim()) || (customLocation && String(customLocation).trim()) || fallbackCoords || 'Custom';
      const createdField = await prisma.field.create({
        data: {
          name,
          location,
          price: 0,
          rating: 0,
          image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
          // Mark as unavailable so it won't appear in public field lists; used only via game relation
          available: false,
          type: typeUpper,
          ...(Number.isFinite(latNum) ? { lat: latNum } : {}),
          ...(Number.isFinite(lngNum) ? { lng: lngNum } : {}),
        }
      });
      useFieldId = createdField.id;
    }

    const field = await prisma.field.findUnique({ where: { id: useFieldId } });
    if (!field) return res.status(404).json({ error: 'Field not found' });

    // upsert user from Clerk
    await prisma.user.upsert({
      where: { id: req.user.id },
      update: { name: req.user.name, imageUrl: req.user.avatar },
      create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar, email: undefined }
    });

    const start = new Date(`${date}T${time}:00`);

    // Recurrence handling (flexible: WEEKLY or CUSTOM)
    const isRecurring = !!recurrence && (recurrence.type || recurrence.isRecurring);
    if (isRecurring) {
      const type = String(recurrence?.type || 'WEEKLY').toUpperCase();

      // Create series template
      const weekly = type === 'WEEKLY';

      let autoOpenRegistrationHours = null;
      if (registrationOpensAt) {
        const diffMs = start.getTime() - new Date(registrationOpensAt).getTime();
        autoOpenRegistrationHours = diffMs / (1000 * 60 * 60);
      }

      const series = await prisma.gameSeries.create({
        data: {
          title,
          organizerId: req.user.id,
          fieldId: useFieldId || null,
          fieldName: field.name,
          fieldLocation: field.location,
          price: field.price ?? 0,
          maxPlayers: Number(maxPlayers),
          dayOfWeek: weekly ? (Number.isInteger(recurrence?.dayOfWeek) ? Number(recurrence.dayOfWeek) : start.getDay()) : null,
          time: String(recurrence?.time || time),
          duration: Number(isNaN(Number(duration)) ? 1 : Number(duration)),
          isActive: true,
          type: weekly ? 'WEEKLY' : 'CUSTOM',
          sport: sport || 'SOCCER',
          autoOpenRegistrationHours
        },
      });

      // Fetch series subscribers
      const subs = await prisma.seriesParticipant.findMany({
        where: { seriesId: series.id },
        select: { userId: true }
      });
      const subscriberIds = Array.from(new Set((subs || []).map(s => s.userId).filter(Boolean)));

      const createOps = [];
      if (weekly) {
        // Generate 4 weekly instances including the base date
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        for (let i = 0; i < 4; i++) {
          const occStart = new Date(start.getTime() + i * oneWeekMs);
          // participants with capacity respected
          const maxCap = Number(maxPlayers);
          const participantsCreate = [];
          participantsCreate.push({
            userId: req.user.id,
            status: organizerInLottery ? 'WAITLISTED' : 'CONFIRMED'
          });
          const alreadyConfirmed = organizerInLottery ? 0 : 1;
          let remainingSlots = Math.max(0, maxCap - alreadyConfirmed);
          for (const uid of subscriberIds) {
            if (uid === req.user.id) continue;
            if (remainingSlots > 0) {
              participantsCreate.push({ userId: uid, status: 'CONFIRMED' });
              remainingSlots -= 1;
            } else {
              participantsCreate.push({ userId: uid, status: 'WAITLISTED' });
            }
          }


          let instanceRegOpen = null;
          if (typeof autoOpenRegistrationHours === 'number') {
            instanceRegOpen = new Date(occStart.getTime() - autoOpenRegistrationHours * 3600000);
          }

          createOps.push(
            prisma.game.create({
              data: {
                title,
                fieldId: useFieldId,
                seriesId: series.id,
                start: occStart,
                duration: duration || 1,
                maxPlayers: Number(maxPlayers),
                isOpenToJoin: isOpenToJoin !== false,
                isFriendsOnly: !!isFriendsOnly,
                lotteryEnabled: !!lotteryEnabled,
                ...(lotteryEnabled && lotteryAt ? { lotteryAt: new Date(String(lotteryAt)) } : {}),
                organizerInLottery: !!organizerInLottery,
                description: description || '',
                organizerId: req.user.id,
                participants: { create: participantsCreate },
                roles: { create: { userId: req.user.id, role: 'ORGANIZER' } },
                sport: sport || 'SOCCER',
                registrationOpensAt: instanceRegOpen,
                sport: sport || 'SOCCER',
                registrationOpensAt: instanceRegOpen,
                friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null,
                teamSize: teamSize ? parseInt(teamSize) : null,
                price: price ? parseInt(price) : null
              },
              include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
            })
          );
        }
      } else {
        // CUSTOM: create per provided dates
        const dateStrs = Array.isArray(recurrence?.dates) ? recurrence.dates : [];
        if (!dateStrs.length) {
          return res.status(400).json({ error: 'CUSTOM recurrence requires dates[]' });
        }
        for (const ds of dateStrs) {
          const occStart = new Date(String(ds));
          if (isNaN(occStart.getTime())) continue;
          const maxCap = Number(maxPlayers);
          const participantsCreate = [];
          participantsCreate.push({
            userId: req.user.id,
            status: organizerInLottery ? 'WAITLISTED' : 'CONFIRMED'
          });
          const alreadyConfirmed = organizerInLottery ? 0 : 1;
          let remainingSlots = Math.max(0, maxCap - alreadyConfirmed);
          for (const uid of subscriberIds) {
            if (uid === req.user.id) continue;
            if (remainingSlots > 0) {
              participantsCreate.push({ userId: uid, status: 'CONFIRMED' });
              remainingSlots -= 1;
            } else {
              participantsCreate.push({ userId: uid, status: 'WAITLISTED' });
            }
          }
          createOps.push(
            prisma.game.create({
              data: {
                title,
                fieldId: useFieldId,
                seriesId: series.id,
                start: occStart,
                duration: duration || 1,
                maxPlayers: Number(maxPlayers),
                isOpenToJoin: isOpenToJoin !== false,
                isFriendsOnly: !!isFriendsOnly,
                lotteryEnabled: !!lotteryEnabled,
                ...(lotteryEnabled && lotteryAt ? { lotteryAt: new Date(String(lotteryAt)) } : {}),
                organizerInLottery: !!organizerInLottery,
                organizerId: req.user.id,
                participants: { create: participantsCreate },
                roles: { create: { userId: req.user.id, role: 'ORGANIZER' } },
                sport: sport || 'SOCCER',
                registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null,
                friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null,
                teamSize: teamSize ? parseInt(teamSize) : null,
                price: price ? parseInt(price) : null
              },
              include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
            })
          );
        }
      }

      const createdGames = await prisma.$transaction(createOps);
      return res.status(201).json(mapGameForClient(createdGames[0]));
    }

    // Single instance flow (original behavior) with basic conflict check
    const conflict = await prisma.game.findFirst({ where: { fieldId: useFieldId, start } });
    if (conflict) {
      return res.status(400).json({ error: 'Time slot is already booked' });
    }

    // Transactional creation of Game + ChatRoom
    const created = await prisma.$transaction(async (tx) => {
      const game = await tx.game.create({
        data: {
          title,
          fieldId: useFieldId,
          start,
          duration: duration || 1,
          maxPlayers: Number(maxPlayers),
          teamSize: teamSize ? parseInt(teamSize) : null,
          price: price ? parseInt(price) : null,
          isOpenToJoin: isOpenToJoin !== false,
          isFriendsOnly: !!isFriendsOnly,
          lotteryEnabled: !!lotteryEnabled,
          ...(lotteryEnabled && lotteryAt ? { lotteryAt: new Date(String(lotteryAt)) } : {}),
          organizerInLottery: !!organizerInLottery,
          description: description || '',
          organizerId: req.user.id,
          // Organizer: confirmed by default, or waitlisted if included in lottery
          participants: {
            create: {
              userId: req.user.id,
              status: organizerInLottery ? 'WAITLISTED' : 'CONFIRMED'
            }
          },
          roles: {
            create: { userId: req.user.id, role: 'ORGANIZER' }
          },
          sport: sport || 'SOCCER',
          registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null,
          friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null
        },
        include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
      });

      // Create ChatRoom immediately within transaction
      await tx.chatRoom.create({
        data: {
          id: game.id,
          type: 'GROUP',
          participants: {
            create: { userId: req.user.id }
          }
        }
      });

      return game;
    });

    const gamePayload = mapGameForClient(created);

    // Socket Notifications (Targeted Delta Update)
    if (req.io) {
      // 1. Notify City
      if (created.field?.city) {
        req.io.to(`city_${created.field.city}`).emit('game:created', gamePayload);
      }

      // 2. Notify Friends
      try {
        const userWithFriends = await prisma.user.findUnique({
          where: { id: req.user.id },
          include: { friendshipsA: true, friendshipsB: true }
        });
        const friendIds = [
          ...(userWithFriends?.friendshipsA || []).map(f => f.userBId),
          ...(userWithFriends?.friendshipsB || []).map(f => f.userAId)
        ];
        friendIds.forEach(fid => {
          req.io.to(`user_${fid}`).emit('game:created', gamePayload);
        });
      } catch (e) {
        console.error("Error notifying friends", e);
      }
    }

    res.status(201).json(gamePayload);
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Get game by ID (must be last to avoid conflicts)
router.get('/:id', async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: { field: true, participants: { include: { user: true, team: true } }, roles: { include: { user: true } }, teams: true }
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // SELF-HEALING: Ensure ChatRoom exists
    const chatRoom = await prisma.chatRoom.findUnique({ where: { id: game.id } });
    if (!chatRoom) {
      console.log(`[Self-Healing] Creating missing ChatRoom for game ${game.id}`);
      try {
        await prisma.chatRoom.create({
          data: {
            id: game.id,
            type: 'GROUP',
            participants: {
              create: { userId: game.organizerId }
            }
          }
        });
        // Note: We don't need to update Game.chatRoomId because we use game.id as the key (Implicit Relation)
      } catch (e) {
        console.error("Failed to self-heal chat room", e);
      }
    }

    res.json(mapGameForClient(game));
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// PUT /api/games/:id/teams - set teams and assignments (Organizer or Manager)
router.put('/:id/teams', authenticateToken, async (req, res) => {
  const gameId = req.params.id;
  const { teams } = req.body || {};
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'Invalid payload: teams must be an array' });
  }

  try {
    // Permission: organizer or manager
    const level = await getRoleLevel(gameId, req.user.id);
    if (level < ROLE_LEVEL.MANAGER) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    // Validate game exists
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Build transactional steps
    const tx = [];

    // 1) Reset teamId for all participants of this game
    tx.push(prisma.participation.updateMany({ where: { gameId }, data: { teamId: null } }));

    // 2) Delete existing teams
    tx.push(prisma.team.deleteMany({ where: { gameId } }));

    // 3) Create teams and 4) Assign players
    // We need sequential logic to get new team IDs; run a sub-transaction after the first two ops.
    await prisma.$transaction(tx);

    const createdTeams = [];
    for (const t of teams) {
      const name = String(t.name || '').trim();
      const color = String(t.color || '').trim();
      if (!name || !color) continue;
      const created = await prisma.team.create({
        data: { gameId, name, color }
      });
      createdTeams.push({ ...created, playerIds: Array.isArray(t.playerIds) ? t.playerIds : [] });
    }

    // Assign players to teams
    for (const ct of createdTeams) {
      if (!ct.playerIds || ct.playerIds.length === 0) continue;
      await prisma.participation.updateMany({
        where: { gameId, userId: { in: ct.playerIds } },
        data: { teamId: ct.id }
      });
    }

    // Return updated game with teams and participants
    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        field: true,
        participants: { include: { user: true } },
        roles: { include: { user: true } },
        teams: true
      }
    });
    return res.json(mapGameForClient(updated));
  } catch (e) {
    console.error('Update teams error:', e);
    return res.status(500).json({ error: 'Failed to update teams' });
  }
});

// Join game
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: { participants: true }
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (!game.isOpenToJoin) {
      return res.status(400).json({ error: 'Game is not open for joining' });
    }

    if (game.registrationOpensAt && new Date() < new Date(game.registrationOpensAt)) {
      return res.status(400).json({ error: 'Registration is not yet open' });
    }

    // If lottery is enabled and hasn't executed yet, allow waitlist joins beyond capacity until lottery time
    if (game.lotteryEnabled) {
      const cutoff = game.lotteryAt ? new Date(game.lotteryAt) : null;
      const now = new Date();
      if (!game.lotteryExecutedAt) {
        if (!cutoff) {
          return res.status(400).json({ error: 'Lottery time is not set for this game' });
        }
        if (now >= cutoff) {
          return res.status(400).json({ error: 'Lottery window is closed for this game' });
        }
        const already = await prisma.participation.findFirst({ where: { gameId: game.id, userId: req.user.id } });
        if (already) {
          return res.status(400).json({ error: 'You are already a participant' });
        }
        await prisma.user.upsert({
          where: { id: req.user.id },
          update: { name: req.user.name, imageUrl: req.user.avatar },
          create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar, email: undefined }
        });
        // Confirm up to capacity; beyond capacity -> waitlist
        const confirmedCountPre = await prisma.participation.count({ where: { gameId: game.id, status: 'CONFIRMED' } });
        const status = confirmedCountPre < game.maxPlayers ? 'CONFIRMED' : 'WAITLISTED';
        await prisma.participation.create({ data: { gameId: game.id, userId: req.user.id, status } });

        // Add to Chat
        try {
          await prisma.chatParticipant.create({ data: { userId: req.user.id, chatId: game.id } });
        } catch (e) {
          // Ignore if chat room doesn't exist or already participant
        }

        const updated = await prisma.game.findUnique({
          where: { id: game.id },
          include: { field: true, participants: { include: { user: true } } }
        });
        return res.json(mapGameForClient(updated));
      }
      // If lottery already ran, fall through to capacity check based on confirmed count
    }

    const confirmedCount = await prisma.participation.count({ where: { gameId: game.id, status: 'CONFIRMED' } });
    if (confirmedCount >= game.maxPlayers) {
      return res.status(400).json({ error: 'Game is full' });
    }

    const already = await prisma.participation.findFirst({ where: { gameId: game.id, userId: req.user.id } });
    if (already) {
      return res.status(400).json({ error: 'You are already a participant' });
    }

    await prisma.user.upsert({
      where: { id: req.user.id },
      update: { name: req.user.name, imageUrl: req.user.avatar },
      create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar, email: undefined }
    });

    await prisma.participation.create({
      data: { gameId: game.id, userId: req.user.id, status: 'CONFIRMED' }
    });

    // Add to Chat
    try {
      await prisma.chatParticipant.create({ data: { userId: req.user.id, chatId: game.id } });
    } catch (e) {
      // Ignore
    }

    const updated = await prisma.game.findUnique({
      where: { id: game.id },
      include: { field: true, participants: { include: { user: true } } }
    });
    res.json(mapGameForClient(updated));
  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Leave game
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const del = await prisma.participation.deleteMany({ where: { gameId: game.id, userId: req.user.id } });
    if (del.count === 0) {
      return res.status(400).json({ error: 'You are not a participant in this game' });
    }

    // Remove from Chat
    try {
      await prisma.chatParticipant.deleteMany({ where: { userId: req.user.id, chatId: game.id } });
    } catch (e) {
      // Ignore
    }

    const remaining = await prisma.participation.findMany({ where: { gameId: game.id } });
    if (game.organizerId === req.user.id) {
      if (remaining.length === 0) {
        await prisma.game.delete({ where: { id: game.id } });
        return res.json({ message: 'Game deleted because organizer left' });
      } else {
        await prisma.game.update({ where: { id: game.id }, data: { organizerId: remaining[0].userId } });
      }
    }

    const updated = await prisma.game.findUnique({
      where: { id: game.id },
      include: { field: true, participants: { include: { user: true } } }
    });
    res.json(mapGameForClient(updated));
  } catch (error) {
    console.error('Leave game error:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Update game (organizer only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (game.organizerId !== req.user.id) {
      return res.status(403).json({ error: 'Only organizer can update game' });
    }
    const { description, isOpenToJoin, maxPlayers, lotteryEnabled, lotteryAt, organizerInLottery } = req.body;

    if (typeof maxPlayers !== 'undefined') {
      const confirmedCount = await prisma.participation.count({ where: { gameId: game.id, status: 'CONFIRMED' } });
      if (Number(maxPlayers) < confirmedCount) {
        return res.status(400).json({ error: 'Max players cannot be less than current players' });
      }
    }

    const updated = await prisma.game.update({
      where: { id: game.id },
      data: {
        ...(typeof description !== 'undefined' ? { description } : {}),
        ...(typeof isOpenToJoin !== 'undefined' ? { isOpenToJoin } : {}),
        ...(typeof maxPlayers !== 'undefined' ? { maxPlayers: Number(maxPlayers) } : {}),
        ...(typeof lotteryEnabled !== 'undefined' ? { lotteryEnabled: !!lotteryEnabled } : {}),
        ...(typeof organizerInLottery !== 'undefined' ? { organizerInLottery: !!organizerInLottery } : {}),
        ...(typeof lotteryAt !== 'undefined' ? { lotteryAt: lotteryAt ? new Date(String(lotteryAt)) : null } : {}),
      },
      include: { field: true, participants: { include: { user: true } } }
    });
    res.json(mapGameForClient(updated));
  } catch (error) {
    console.error('Update game error:', error);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

// Delete game (organizer only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (game.organizerId !== req.user.id) {
      return res.status(403).json({ error: 'Only organizer can delete game' });
    }
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

module.exports = router;