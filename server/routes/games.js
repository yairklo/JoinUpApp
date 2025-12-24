const express = require('express');
const dataManager = require('../utils/dataManager');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { PrismaClient } = require('@prisma/client');
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
    seriesId: game.seriesId || null,
    fieldId: game.fieldId,
    fieldName: game.field?.name || '',
    fieldLocation: game.field?.location || '',
    isFriendsOnly: !!game.isFriendsOnly,
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
    teams: teams || []
  };
}

const router = express.Router();

// Build visibility where-clause depending on viewerId
function buildVisibilityWhere(viewerId) {
  if (!viewerId) {
    return { isFriendsOnly: false };
  }
  return {
    OR: [
      { isFriendsOnly: false },
      {
        AND: [
          { isFriendsOnly: true },
          {
            OR: [
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
          },
        ],
      },
    ],
  };
}

// Public games only (no auth, no friends-only)
router.get('/public', async (req, res) => {
  try {
    const { fieldId, date, isOpenToJoin } = req.query;
    const where = { isFriendsOnly: false };
    if (fieldId) where.fieldId = String(fieldId);
    if (typeof isOpenToJoin !== 'undefined') where.isOpenToJoin = String(isOpenToJoin) === 'true';
    if (date) {
      const d = new Date(String(date));
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      where.start = { gte: startOfDay, lte: endOfDay };
    }
    const games = await prisma.game.findMany({
      where,
      include: { field: true, participants: { include: { user: true } } },
      orderBy: { start: 'asc' }
    });
    res.json(games.map(mapGameForClient));
  } catch (error) {
    console.error('Public games error:', error);
    res.status(500).json({ error: 'Failed to get public games' });
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
    const requestedRole = (role && ['MANAGER','MODERATOR'].includes(String(role))) ? String(role).toUpperCase() : 'MANAGER';
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
    res.json(games.map(mapGameForClient));
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
      customLat,
      customLng,
      customLocation
    } = req.body;

    // Accept numeric strings as well
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
      const series = await prisma.gameSeries.create({
        data: {
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
          createOps.push(
            prisma.game.create({
              data: {
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
                roles: { create: { userId: req.user.id, role: 'ORGANIZER' } }
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
                roles: { create: { userId: req.user.id, role: 'ORGANIZER' } }
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

    const created = await prisma.game.create({
      data: {
        fieldId: useFieldId,
        start,
        duration: duration || 1,
        maxPlayers: Number(maxPlayers),
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
        }
      },
      include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true }
    });

    res.status(201).json(mapGameForClient(created));
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