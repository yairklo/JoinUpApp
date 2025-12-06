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
  const allParts = game.participants || [];
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
    avatar: p.user?.imageUrl || null
  }));
  const waitlistParticipants = waitlisted.map(p => ({
    id: p.userId,
    name: p.user?.name || null,
    avatar: p.user?.imageUrl || null
  }));
  return {
    id: game.id,
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
    participants,
    waitlistParticipants
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

    // optional basic conflict check
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
        }
      },
      include: { field: true, participants: { include: { user: true } } }
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
      include: { field: true, participants: { include: { user: true } } }
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
        await prisma.participation.create({ data: { gameId: game.id, userId: req.user.id, status: 'WAITLISTED' } });
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