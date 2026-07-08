const express = require('express');
const dataManager = require('../utils/dataManager');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { PrismaClient, SportType } = require('@prisma/client');
const { NotificationService } = require('../services/notificationService');
const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);


function mapGameForClient(game, viewerId) {
  if (!game) return game;
  const allParts = Array.isArray(game?.participants) ? game.participants : [];
  const confirmed = allParts.filter(p => p.status === 'CONFIRMED');
  const waitlisted = allParts.filter(p => p.status === 'WAITLISTED');
  const pending = allParts.filter(p => p.status === 'PENDING');
  const viewerParticipationStatus = viewerId
    ? (allParts.find(p => p.userId === viewerId)?.status || null)
    : null;
  // Exclude PENDING/REJECTED join requests from roster/capacity accounting - they aren't on the roster yet.
  const totalSignups = allParts.filter(p => p.status === 'CONFIRMED' || p.status === 'WAITLISTED' || p.status === 'NOT_SELECTED').length;
  const confirmedCount = confirmed.length;
  const waitlistCount = waitlisted.length;
  const pendingRequestCount = pending.length;
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
    joinPolicy: game.joinPolicy || 'INSTANT',
    pendingRequestCount,
    viewerParticipationStatus,
    lotteryEnabled: !!game.lotteryEnabled,
    lotteryAt: lotteryAtIso,
    organizerInLottery: !!game.organizerInLottery,
    fieldLat: typeof game.field?.lat === 'number' ? game.field.lat : null,
    fieldLng: typeof game.field?.lng === 'number' ? game.field.lng : null,
    customLat: typeof game.customLat === 'number' ? game.customLat : null,
    customLng: typeof game.customLng === 'number' ? game.customLng : null,
    customLocation: game.customLocation || null,
    start: game.start.toISOString(),
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
    chatRoomId: game.id,
    status: game.status
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
        { status: 'OPEN' },
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
    res.json(deduped.map(g => mapGameForClient(g, req.user?.id)));
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
          { status: 'OPEN' },
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
    res.json(deduped.map(g => mapGameForClient(g, req.user.id)));
  } catch (error) {
    console.error('My games error:', error);
    res.status(500).json({ error: 'Failed to fetch my games' });
  }
});

// My game history
router.get('/my/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const games = await prisma.game.findMany({
      where: {
        OR: [
          { participants: { some: { userId } } },
          { organizerId: userId }
        ],
        status: 'COMPLETED'
      },
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'desc' },
      take: 50
    });
    res.json(games.map(g => mapGameForClient(g, req.user.id)));
  } catch (error) {
    console.error('My history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
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
    res.json(deduped.map(g => mapGameForClient(g, req.user.id)));
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
    res.json(deduped.map(g => mapGameForClient(g, req.user?.id)));
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
        price: existing.price ?? existing.field?.price ?? 0,
        maxPlayers: existing.maxPlayers,
        dayOfWeek: start.getDay(),
        time,
        duration: Number(existing.duration),
        isActive: true,
        duration: Number(existing.duration),
        isActive: true,
        sport: existing.sport,
        autoOpenRegistrationHours: existing.registrationOpensAt ? (start.getTime() - new Date(existing.registrationOpensAt).getTime()) / 3600000 : null
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
            price: existing.price ?? existing.field?.price ?? 0,
            teamSize: existing.teamSize,
            customLat: existing.customLat,
            customLng: existing.customLng,
            customLocation: existing.customLocation,
            isOpenToJoin: existing.isOpenToJoin,
            isFriendsOnly: existing.isFriendsOnly,
            lotteryEnabled: existing.lotteryEnabled,
            ...(existing.lotteryEnabled && existing.lotteryAt ? { lotteryAt: new Date(existing.lotteryAt) } : {}),
            organizerInLottery: existing.organizerInLottery,
            description: existing.description || '',
            organizerId: existing.organizerId,
            participants: { create: participantsCreate },
            roles: { create: { userId: existing.organizerId, role: 'ORGANIZER' } },
            roles: { create: { userId: existing.organizerId, role: 'ORGANIZER' } },
            sport: existing.sport,
            registrationOpensAt: (existing.registrationOpensAt)
              ? new Date(occStart.getTime() - (start.getTime() - new Date(existing.registrationOpensAt).getTime()))
              : null
          },
          include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
        })
      );

    }

    const createdGames = await prisma.$transaction(createOps);

    const seriesPayload = {
      id: series.id,
      name: series.title || "Series",
      fieldName: series.fieldName,
      time: series.time,
      dayOfWeek: series.dayOfWeek,
      subscriberCount: subscriberIds.length,
      sport: series.sport,
      subscriberIds: subscriberIds
    };

    if (req.io) {
      req.io.emit('series:created', seriesPayload);
    }

    return res.json({
      game: mapGameForClient(updated, req.user.id),
      created: createdGames.map(g => mapGameForClient(g, req.user.id)),
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
    const { time, date, start, maxPlayers, sport, registrationOpensAt, title, friendsOnlyUntil, isFriendsOnly, teamSize, joinPolicy } = req.body || {};

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
    if (start) {
      const parsedStart = new Date(start);
      if (!Number.isNaN(parsedStart.getTime())) {
        updates['start'] = parsedStart;
      }
    } else {
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

    if (joinPolicy === 'INSTANT' || joinPolicy === 'REQUIRES_APPROVAL') {
      updates['joinPolicy'] = joinPolicy;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const updated = await prisma.game.update({
      where: { id: gameId },
      data: updates,
      include: { field: true, participants: { include: { user: true, team: true } }, roles: { include: { user: true } }, teams: true }
    });

    return res.json(mapGameForClient(updated, req.user.id));
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
    res.json(games.map(g => mapGameForClient(g, req.user?.id)));
  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({ error: 'Failed to get games' });
  }
});

// Search games
router.get('/search', attachOptionalUser, async (req, res) => {
  try {
    const { fieldId, date, isOpenToJoin, q, city, minLat, maxLat, minLng, maxLng, sport, networkGames } = req.query;
    const where = {};
    if (fieldId) where.fieldId = String(fieldId);
    if (typeof isOpenToJoin !== 'undefined') where.isOpenToJoin = String(isOpenToJoin) === 'true';

    // Handle Extended Social Network (Recursive CTE for 2nd Degree friends)
    if (networkGames === 'true' && req.user?.id) {
      const viewerId = req.user.id;
      try {
        const friends = await prisma.$queryRaw`
          WITH RECURSIVE social_network AS (
            SELECT 
              CASE WHEN "userAId" = ${viewerId} THEN "userBId" ELSE "userAId" END AS user_id,
              1 AS depth
            FROM "Friendship"
            WHERE "userAId" = ${viewerId} OR "userBId" = ${viewerId}

            UNION

            SELECT 
              CASE WHEN f."userAId" = sn.user_id THEN f."userBId" ELSE f."userAId" END,
              sn.depth + 1
            FROM "Friendship" f
            INNER JOIN social_network sn ON f."userAId" = sn.user_id OR f."userBId" = sn.user_id
            WHERE sn.depth < 2
          )
          SELECT DISTINCT user_id FROM social_network WHERE user_id != ${viewerId};
        `;
        const friendIds = friends.map((f) => f.user_id);
        if (friendIds.length > 0) {
          where.participants = {
            some: {
              userId: { in: friendIds }
            }
          };
        } else {
          // Force no results if user has no friends at all in their network
          where.id = 'none';
        }
      } catch (dbErr) {
        console.error('Recursive CTE Social Network query failed:', dbErr);
      }
    }

    if (date) {
      const d = new Date(String(date));
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      where.start = { gte: startOfDay, lte: endOfDay };
    } else {
      // If no specific date is provided, filter out past games from the database level.
      // This prevents deduplicateSeriesGames from keeping an old past game and hiding future games.
      where.start = { gte: new Date() };
    }
    
    if (sport) {
      where.sport = String(sport);
    }
    
    // Add text search
    if (q) {
      where.OR = [
        { title: { contains: String(q), mode: 'insensitive' } },
        { description: { contains: String(q), mode: 'insensitive' } },
        { field: { name: { contains: String(q), mode: 'insensitive' } } }
      ];
    }
    
    // Add city filter
    if (city) {
      where.field = { ...where.field, city: String(city) };
    }

    // Add Bounding Box filter (Spatial bounds)
    if (minLat && maxLat && minLng && maxLng) {
      const boundsWhere = {
        OR: [
          {
            customLat: { gte: parseFloat(minLat), lte: parseFloat(maxLat) },
            customLng: { gte: parseFloat(minLng), lte: parseFloat(maxLng) }
          },
          {
            field: {
              lat: { gte: parseFloat(minLat), lte: parseFloat(maxLat) },
              lng: { gte: parseFloat(minLng), lte: parseFloat(maxLng) }
            }
          }
        ]
      };
      
      if (where.OR) {
        where.AND = [{ OR: where.OR }, boundsWhere];
        delete where.OR;
      } else {
        where.OR = boundsWhere.OR;
      }
    }

    const visibility = buildVisibilityWhere(req.user?.id);
    // Combine base visibility rules with query rules
    const finalWhere = where.AND ? { AND: [visibility, ...where.AND] } : { AND: [visibility, where] };
    
    const games = await prisma.game.findMany({
      where: finalWhere,
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });

    const deduped = deduplicateSeriesGames(games);
    res.json(deduped.map(g => mapGameForClient(g, req.user?.id)));
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
    res.json(games.map(g => mapGameForClient(g, req.user?.id)));
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
    res.json(games.map(g => mapGameForClient(g, req.user?.id)));
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
    res.json(games.map(g => mapGameForClient(g, req.user?.id)));
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
      start: payloadStart, // strict UTC ISO timestamp from new clients
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
      customLat,
      joinPolicy
    } = req.body;
    const latNum = typeof customLat === 'undefined' ? NaN : parseFloat(String(customLat));
    const lngNum = typeof customLng === 'undefined' ? NaN : parseFloat(String(customLng));
    const hasFieldId = !!fieldId;
    const hasNewFieldText = !!(newField && (String(newField.name || '').trim() || String(newField.location || '').trim()));
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const hasStart = !!payloadStart;
    const hasDate = !!date;
    const hasTime = !!time;
    const hasMaxPlayers = !!maxPlayers;

    if (!(hasFieldId || hasNewFieldText || hasCoords) || (!hasStart && (!hasDate || !hasTime)) || !hasMaxPlayers) {
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

    const { parseJerusalemTimeToUTC } = require('../utils/timezone');
    const start = payloadStart ? new Date(payloadStart) : parseJerusalemTimeToUTC(date, time);

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
                joinPolicy: joinPolicy === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : 'INSTANT',
                lotteryEnabled: !!lotteryEnabled,
                ...(lotteryEnabled && lotteryAt ? { lotteryAt: new Date(String(lotteryAt)) } : {}),
                organizerInLottery: !!organizerInLottery,
                description: description || '',
                organizerId: req.user.id,
                participants: { create: participantsCreate },
                roles: { create: { userId: req.user.id, role: 'ORGANIZER' } },
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
                joinPolicy: joinPolicy === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : 'INSTANT',
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
      return res.status(201).json(mapGameForClient(createdGames[0], req.user.id));
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
          joinPolicy: joinPolicy === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : 'INSTANT',
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

    // Viewer-agnostic payload for broadcasting to other users (city/friends rooms) — must not
    // carry the creator's own viewerParticipationStatus, since it would be misleading for them.
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

    // 3. Notify every user whose profile city matches the game's city (DB record + push),
    // regardless of whether they're currently connected. Runs after the response and never
    // blocks game creation if it fails.
    if (created.field?.city) {
      const cityGameName = created.field.name || 'מגרש חדש';
      prisma.user.findMany({
        where: {
          city: { equals: created.field.city, mode: 'insensitive' },
          id: { not: req.user.id }
        },
        select: { id: true }
      }).then(cityUsers => {
        cityUsers.forEach(u => {
          notificationService.sendNotification(
            u.id,
            'NEW_GAME_IN_CITY',
            `משחק חדש ב${created.field.city}`,
            `${req.user.name || 'מישהו'} פתח/ה משחק חדש ב${cityGameName}`,
            { gameId: created.id, city: created.field.city, link: `/game/${created.id}` },
            req.io
          ).catch(err => console.error('[NOTIFICATIONS] Failed to notify city user', u.id, err));
        });
      }).catch(err => console.error('[NOTIFICATIONS] Failed to query city users', err));
    }

    res.status(201).json(mapGameForClient(created, req.user.id));
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Get game by ID (must be last to avoid conflicts)
router.get('/:id', attachOptionalUser, async (req, res) => {
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

    res.json(mapGameForClient(game, req.user?.id));
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
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (e) {
    console.error('Update teams error:', e);
    return res.status(500).json({ error: 'Failed to update teams' });
  }
});

// Notify the organizer when someone joins their private (friends-only) match instantly.
// Fire-and-forget: never blocks or fails the join itself.
function notifyOrganizerOfInstantJoin(game, joiningUser, io) {
  if (!game.isFriendsOnly || game.organizerId === joiningUser.id) return;
  notificationService.sendNotification(
    game.organizerId,
    'GAME_JOIN_REQUEST',
    'מישהו הצטרף למשחק שלך',
    `${joiningUser.name || 'משתמש'} הצטרף/ה למשחק הפרטי שלך`,
    { gameId: game.id, userId: joiningUser.id, link: `/game/${game.id}` },
    io
  ).catch(err => console.error('[NOTIFICATIONS] Failed to notify organizer of join', game.id, err));
}

// Notify the organizer that a join request is awaiting their approval (actionable).
function notifyOrganizerOfPendingRequest(game, requestingUser, io) {
  notificationService.sendNotification(
    game.organizerId,
    'GAME_JOIN_REQUEST',
    'בקשת הצטרפות חדשה',
    `${requestingUser.name || 'משתמש'} ביקש/ה להצטרף למשחק שלך וממתין/ה לאישורך`,
    // Requests are reviewed inline on the existing game detail screen (organizer-only section),
    // not a separate route — clients build their own platform path from data.gameId anyway.
    { gameId: game.id, userId: requestingUser.id, link: `/game/${game.id}` },
    io
  ).catch(err => console.error('[NOTIFICATIONS] Failed to notify organizer of pending request', game.id, err));
}

// Push the freshest roster/game state to everyone with a stake in this game (organizer and all
// current participants — managers are always participants too, per the /roles endpoint's own
// invariant, so they're covered without a separate roles fetch), personalized per-recipient so
// viewerParticipationStatus is correct for each of them. Uses each user's always-joined
// `user_<id>` presence room — no client-side room subscription required. Fire-and-forget: never
// blocks or fails the action that triggered it.
//
// Perf: every call site already re-fetches the game (with the same `field`+`participants.user`
// include) to build its own HTTP response right after triggering this broadcast. Pass that
// already-fetched game as `preFetchedGame` to skip this function's redundant duplicate query.
async function broadcastGameUpdate(io, gameId, preFetchedGame) {
  if (!io || !gameId) return;
  const game = preFetchedGame || await prisma.game.findUnique({
    where: { id: gameId },
    include: { field: true, participants: { include: { user: true } } }
  });
  if (!game) return;

  const recipients = new Set([game.organizerId]);
  (game.participants || []).forEach(p => recipients.add(p.userId));
  (game.roles || []).forEach(r => recipients.add(r.userId));

  recipients.forEach(uid => {
    io.to(`user_${uid}`).emit('game:updated', mapGameForClient(game, uid));
  });
}

// Notify the requester once the organizer/manager has made a decision.
function notifyRequesterOfDecision(game, requesterId, approved, io) {
  notificationService.sendNotification(
    requesterId,
    approved ? 'GAME_JOIN_APPROVED' : 'GAME_JOIN_REJECTED',
    approved ? 'הבקשה שלך אושרה' : 'הבקשה שלך נדחתה',
    approved
      ? `בקשתך להצטרף למשחק אושרה על ידי המארגן`
      : `בקשתך להצטרף למשחק נדחתה על ידי המארגן`,
    { gameId: game.id, link: `/game/${game.id}` },
    io
  ).catch(err => console.error('[NOTIFICATIONS] Failed to notify requester of decision', game.id, err));
}

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

    // Approval-gated games (non-lottery only, for now): create a PENDING request instead of
    // an instant CONFIRMED participation. The organizer bypasses approval on their own game.
    if (game.joinPolicy === 'REQUIRES_APPROVAL' && !game.lotteryEnabled && game.organizerId !== req.user.id) {
      const already = await prisma.participation.findFirst({ where: { gameId: game.id, userId: req.user.id } });
      if (already) {
        if (already.status === 'PENDING') {
          return res.status(400).json({ error: 'Your join request is already pending approval' });
        }
        if (already.status === 'REJECTED') {
          return res.status(400).json({ error: 'Your request to join this game was declined' });
        }
        return res.status(400).json({ error: 'You are already a participant' });
      }

      await prisma.user.upsert({
        where: { id: req.user.id },
        update: { name: req.user.name, imageUrl: req.user.avatar },
        create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar, email: undefined }
      });

      await prisma.participation.create({
        data: { gameId: game.id, userId: req.user.id, status: 'PENDING' }
      });
      notifyOrganizerOfPendingRequest(game, req.user, req.io);

      const updated = await prisma.game.findUnique({
        where: { id: game.id },
        include: { field: true, participants: { include: { user: true } } }
      });
      broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
      return res.json({ ...mapGameForClient(updated, req.user.id), pending: true });
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
        notifyOrganizerOfInstantJoin(game, req.user, req.io);

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
        broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
        return res.json(mapGameForClient(updated, req.user.id));
      }
      // If lottery already ran, fall through to capacity check based on confirmed count
    }

    const confirmedCount = await prisma.participation.count({ where: { gameId: game.id, status: 'CONFIRMED' } });
    if (confirmedCount >= game.maxPlayers) {
      return res.status(400).json({ error: 'Game is full' });
    }

    const already = await prisma.participation.findFirst({ where: { gameId: game.id, userId: req.user.id } });
    if (already) {
      if (already.status === 'CONFIRMED' || already.status === 'WAITLISTED') {
        return res.status(400).json({ error: 'You are already a participant' });
      }
      // PENDING/REJECTED row left over from a time when this game required approval. The game is
      // now INSTANT, so cleanly upgrade the existing row instead of tripping over the
      // (gameId, userId) unique constraint and bouncing the user with a stale error.
      await prisma.participation.update({ where: { id: already.id }, data: { status: 'CONFIRMED' } });
      notifyOrganizerOfInstantJoin(game, req.user, req.io);

      try {
        await prisma.chatParticipant.create({ data: { userId: req.user.id, chatId: game.id } });
      } catch (e) {
        // Ignore if already a chat participant
      }

      const updatedFromExisting = await prisma.game.findUnique({
        where: { id: game.id },
        include: { field: true, participants: { include: { user: true } } }
      });
      broadcastGameUpdate(req.io, game.id, updatedFromExisting).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
      return res.json(mapGameForClient(updatedFromExisting, req.user.id));
    }

    await prisma.user.upsert({
      where: { id: req.user.id },
      update: { name: req.user.name, imageUrl: req.user.avatar },
      create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar, email: undefined }
    });

    await prisma.participation.create({
      data: { gameId: game.id, userId: req.user.id, status: 'CONFIRMED' }
    });
    notifyOrganizerOfInstantJoin(game, req.user, req.io);

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
    broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
    res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// List pending join requests (organizer/manager only)
router.get('/:id/join-requests', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    if (!(await canManageGame(gameId, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    const [requests, rejected] = await Promise.all([
      prisma.participation.findMany({
        where: { gameId, status: 'PENDING' },
        include: { user: true },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.participation.findMany({
        where: { gameId, status: 'REJECTED' },
        include: { user: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);
    const toDTO = (p) => ({
      userId: p.userId,
      name: p.user?.name || null,
      avatar: p.user?.imageUrl || null,
      requestedAt: p.createdAt.toISOString()
    });
    return res.json({
      requests: requests.map(toDTO),
      rejected: rejected.map(toDTO)
    });
  } catch (e) {
    console.error('List join requests error:', e);
    return res.status(500).json({ error: 'Failed to list join requests' });
  }
});

// Approve a pending join request (organizer/manager only)
router.post('/:id/join-requests/:userId/approve', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;
    if (!(await canManageGame(gameId, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Allow approving from PENDING (normal flow) or REJECTED (organizer reversing a misclick via
    // "Approve Anyway") — both are valid states to promote into the roster.
    const request = await prisma.participation.findFirst({
      where: { gameId, userId: targetUserId, status: { in: ['PENDING', 'REJECTED'] } }
    });
    if (!request) return res.status(404).json({ error: 'No pending or rejected request found for this user' });

    const confirmedCount = await prisma.participation.count({ where: { gameId, status: 'CONFIRMED' } });
    const newStatus = confirmedCount < game.maxPlayers ? 'CONFIRMED' : 'WAITLISTED';

    await prisma.participation.update({ where: { id: request.id }, data: { status: newStatus } });

    try {
      await prisma.chatParticipant.create({ data: { userId: targetUserId, chatId: gameId } });
    } catch (e) {
      // Ignore if already a chat participant
    }

    notifyRequesterOfDecision(game, targetUserId, true, req.io);

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (e) {
    console.error('Approve join request error:', e);
    return res.status(500).json({ error: 'Failed to approve join request' });
  }
});

// Reject a pending join request (organizer/manager only)
router.post('/:id/join-requests/:userId/reject', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;
    if (!(await canManageGame(gameId, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const request = await prisma.participation.findFirst({ where: { gameId, userId: targetUserId, status: 'PENDING' } });
    if (!request) return res.status(404).json({ error: 'No pending request found for this user' });

    await prisma.participation.update({ where: { id: request.id }, data: { status: 'REJECTED' } });

    notifyRequesterOfDecision(game, targetUserId, false, req.io);

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (e) {
    console.error('Reject join request error:', e);
    return res.status(500).json({ error: 'Failed to reject join request' });
  }
});

// Leave game
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot leave a completed game' });
    }

    const participants = await prisma.participation.findMany({ where: { gameId: game.id } });
    const isParticipant = participants.some(p => p.userId === req.user.id);

    if (!isParticipant) {
      return res.status(400).json({ error: 'You are not a participant in this game' });
    }

    // CHECK: Is this the last player?
    if (participants.length === 1 && participants[0].userId === req.user.id) {
      // Delete the game completely
      const gameId = game.id;
      await prisma.$transaction([
        prisma.participation.deleteMany({ where: { gameId } }),
        prisma.gameRole.deleteMany({ where: { gameId } }),
        prisma.team.deleteMany({ where: { gameId } }),
        prisma.chatParticipant.deleteMany({ where: { chatId: gameId } }),
        prisma.chatRoom.deleteMany({ where: { id: gameId } }),
        prisma.game.delete({ where: { id: gameId } })
      ]);

      const io = req.io;
      if (io) {
        io.emit('game:deleted', { gameIds: [gameId] });
      }
      return res.json({ message: 'Game deleted because the last player left', deleted: true });
    }

    // Normal leave logic
    await prisma.participation.deleteMany({ where: { gameId: game.id, userId: req.user.id } });

    // Remove from Chat
    try {
      await prisma.chatParticipant.deleteMany({ where: { userId: req.user.id, chatId: game.id } });
    } catch (e) { /* Ignore */ }

    // If organizer left (but others remain), reassign organizer
    const remaining = await prisma.participation.findMany({ where: { gameId: game.id } });
    if (game.organizerId === req.user.id) {
      if (remaining.length > 0) {
        await prisma.game.update({ where: { id: game.id }, data: { organizerId: remaining[0].userId } });
      }
    }

    const updated = await prisma.game.findUnique({
      where: { id: game.id },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
    res.json(mapGameForClient(updated, req.user.id));
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

// Delete game (organizer or admin)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id } });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const isAdmin = !!req.user?.isAdmin;
    if (game.organizerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Only organizer or admin can delete game' });
    }

    const gameId = game.id;

    // Manual Cascade Delete (Transaction for safety)
    // Note: We explicitly delete related records since we don't have onDelete: Cascade in all schema relations
    await prisma.$transaction([
      prisma.participation.deleteMany({ where: { gameId } }),
      prisma.gameRole.deleteMany({ where: { gameId } }),
      prisma.team.deleteMany({ where: { gameId } }),
      // Chat cleanup (Implicit relation by ID)
      prisma.chatParticipant.deleteMany({ where: { chatId: gameId } }),
      prisma.chatRoom.deleteMany({ where: { id: gameId } }),
      // Finally Game
      prisma.game.delete({ where: { id: gameId } })
    ]);

    const io = req.io;
    if (io) {
      io.emit('game:deleted', { gameIds: [gameId] });

      // HEIR PROMOTION: Broadcast next game in series if exists
      if (game.seriesId) {
        try {
          const nextGame = await prisma.game.findFirst({
            where: {
              seriesId: game.seriesId,
              start: { gt: new Date() },
              id: { not: gameId }
            },
            orderBy: { start: 'asc' },
            include: {
              field: true,
              participants: {
                include: { user: true }
              },
              teams: true,
              roles: { include: { user: true } }
            }
          });

          if (nextGame) {
            const mapped = mapGameForClient(nextGame);
            io.emit('game:created', mapped);
          }
        } catch (heirError) {
          console.error("Failed to promote heir game", heirError);
        }
      }
    }

    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    console.error('Delete game error:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

module.exports = router;