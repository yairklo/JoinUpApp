const express = require('express');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { prisma } = require('../lib/prisma');
const { createImageUpload, handleSingleUpload, absoluteUrlFor, deleteUploadedFile } = require('../middleware/upload');
const { parseJerusalemTimeToUTC, formatJerusalemDate, formatJerusalemTime } = require('../utils/timezone');
const gameScheduler = require('../services/gameScheduler');
const { sanitizeFreeText } = require('../utils/sanitize');
const { SPORT_KEYS } = require('../utils/sports');

const WELCOME_MESSAGE_MAX_LENGTH = 2000;
const MIN_MAX_PLAYERS = 2;

const router = express.Router();
const seriesImageUpload = createImageUpload('series');

// Organizer, a MANAGER participant, or an admin may manage a series's settings/image.
async function canManageSeries(series, user) {
  if (!series || !user) return false;
  if (series.organizerId === user.id || user.isAdmin) return true;
  const participant = await prisma.seriesParticipant.findUnique({
    where: { seriesId_userId: { seriesId: series.id, userId: user.id } }
  });
  return participant?.role === 'MANAGER';
}

function mapGameForClient(game) {
  if (!game) return game;
  const start = new Date(game.start);
  // Jerusalem wall-clock, not the server's timezone (see formatJerusalemDate/Time).
  const date = formatJerusalemDate(start);
  const time = formatJerusalemTime(start);
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
    teams: teams || [],
    sport: game.sport,
    city: game.field?.city || null,
    registrationOpensAt: game.registrationOpensAt ? new Date(game.registrationOpensAt).toISOString() : null,
    chatRoomId: game.id
  };
}

// List all active series
router.get('/active', attachOptionalUser, async (req, res) => {
  try {
    const seriesList = await prisma.gameSeries.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { subscribers: true } },
        subscribers: {
          select: { userId: true }
        }
      }
    });

    const organizers = await prisma.user.findMany({
      where: { id: { in: seriesList.map(s => s.organizerId) } },
      select: { id: true, name: true, imageUrl: true }
    });

    const userId = req.user?.id;
    const results = seriesList.map(s => {
      const org = organizers.find(u => u.id === s.organizerId);
      const isSubscribed = userId ? s.subscribers.some(sub => sub.userId === userId) : false;
      return {
        id: s.id,
        title: s.title || null,
        name: s.title || `${s.fieldName} • ${s.time}`,
        fieldName: s.fieldName,
        fieldLocation: s.fieldLocation,
        time: s.time,
        dayOfWeek: s.dayOfWeek,
        type: s.type,
        organizer: {
          id: org?.id || s.organizerId,
          name: org?.name || '',
          avatar: org?.imageUrl || ''
        },
        subscriberCount: s._count.subscribers,
        sport: s.sport,
        isSubscribed
      };
    });

    res.json(results);
  } catch (e) {
    console.error('List active series error:', e);
    res.status(500).json({ error: 'Failed to list active series' });
  }
});

// Public: series details (organizer, subscribers, upcoming games)
router.get('/:seriesId', async (req, res) => {
  try {
    const { seriesId: rawId } = req.params;
    let seriesId = rawId;

    let series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });

    // Fallback: if not found, client may have sent a gameId instead of seriesId.
    if (!series) {
      const maybeGame = await prisma.game.findUnique({
        where: { id: seriesId },
        select: { id: true, seriesId: true }
      });
      if (maybeGame && maybeGame.seriesId) {
        series = await prisma.gameSeries.findUnique({ where: { id: maybeGame.seriesId } });
      }
    }

    if (!series) return res.status(404).json({ error: 'Series not found' });

    // Use the actual series.id for all related queries
    seriesId = series.id;

    const { includeAll } = req.query;
    const gameQueryArgs = {
      where: { seriesId, start: { gte: new Date() } },
      orderBy: { start: 'asc' },
      include: { participants: true }
    };

    // Only limit if not explicitly asked for all
    if (includeAll !== 'true') {
      gameQueryArgs.take = 10;
    }

    const [organizer, subscribers, upcoming, field] = await Promise.all([
      prisma.user.findUnique({
        where: { id: series.organizerId },
        select: { id: true, name: true, imageUrl: true }
      }),
      prisma.seriesParticipant.findMany({
        where: { seriesId },
        include: { user: { select: { id: true, name: true, imageUrl: true } } }
      }),
      prisma.game.findMany(gameQueryArgs),
      series.fieldId
        ? prisma.field.findUnique({ where: { id: series.fieldId }, select: { lat: true, lng: true } })
        : Promise.resolve(null)
    ]);

    const upcomingGames = (upcoming || []).map(g => {
      const confirmed = (g.participants || []).filter(p => p.status === 'CONFIRMED').length;
      return {
        id: g.id,
        date: new Date(g.start).toISOString(),
        // Jerusalem wall-clock HH:mm, so clients don't have to re-derive it in the device timezone.
        time: formatJerusalemTime(g.start),
        currentPlayers: confirmed,
        maxPlayers: g.maxPlayers
      };
    });

    const payload = {
      id: series.id,
      title: series.title || null,
      name: series.title || `${series.fieldName} • ${series.time}`,
      fieldId: series.fieldId ?? null,
      fieldName: series.fieldName,
      fieldLocation: series.fieldLocation,
      fieldLat: typeof field?.lat === 'number' ? field.lat : null,
      fieldLng: typeof field?.lng === 'number' ? field.lng : null,
      time: series.time,
      duration: series.duration,
      dayOfWeek: series.dayOfWeek ?? null,
      type: series.type,
      sport: series.sport,
      maxPlayers: series.maxPlayers,
      price: series.price,
      isOpenToJoin: series.isOpenToJoin,
      isFriendsOnly: series.isFriendsOnly,
      joinPolicy: series.joinPolicy,
      lotteryEnabled: series.lotteryEnabled,
      organizerInLottery: series.organizerInLottery,
      teamSize: series.teamSize ?? null,
      welcomeMessage: series.welcomeMessage ?? null,
      autoOpenRegistrationHours: series.autoOpenRegistrationHours,
      description: series.description || null,
      imageUrl: series.imageUrl || null,
      organizer: {
        id: organizer?.id || series.organizerId,
        name: organizer?.name || '',
        avatar: organizer?.imageUrl || ''
      },
      subscribers: (subscribers || []).map(s => ({
        userId: s.userId,
        role: s.role || 'MEMBER',
        user: {
          id: s.user?.id || s.userId,
          name: s.user?.name || '',
          avatar: s.user?.imageUrl || ''
        }
      })),
      upcomingGames
    };

    return res.json(payload);
  } catch (e) {
    console.error('Series details error:', e);
    return res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// Subscribe to a series (become a regular)
router.post('/:seriesId/subscribe', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const userId = req.user.id;
    // Ensure series exists
    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });

    await prisma.seriesParticipant.upsert({
      where: { seriesId_userId: { seriesId, userId } },
      update: {},
      create: { seriesId, userId, role: 'MEMBER' }
    });

    // The user explicitly requested not to auto-register subscribers to upcoming games,
    // so they are just subscribed to the series for notifications.

    return res.json({ ok: true });
  } catch (e) {
    console.error('Series subscribe error:', e);
    return res.status(500).json({ error: 'Failed to subscribe to series' });
  }
});

// Unsubscribe from a series
router.delete('/:seriesId/subscribe', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const userId = req.user.id;
    await prisma.seriesParticipant.deleteMany({
      where: { seriesId, userId }
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('Series unsubscribe error:', e);
    return res.status(500).json({ error: 'Failed to unsubscribe from series' });
  }
});

// Update a series and optionally propagate to future games
router.patch('/:seriesId', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const {
      title,
      time,
      fieldId,
      fieldName,
      fieldLocation,
      price,
      maxPlayers,
      dayOfWeek,
      autoOpenRegistrationHours,
      description,
      imageUrl,
      duration,
      sport,
      isOpenToJoin,
      isFriendsOnly,
      joinPolicy,
      lotteryEnabled,
      organizerInLottery,
      teamSize,
      welcomeMessage,
      updateFutureGames = true,
    } = req.body || {};

    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (!(await canManageSeries(series, req.user))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    // Block changing dayOfWeek for existing WEEKLY series in MVP
    const changingDay = typeof dayOfWeek !== 'undefined' && dayOfWeek !== null && series.type === 'WEEKLY';
    if (changingDay) {
      return res.status(400).json({ error: 'Changing dayOfWeek for existing WEEKLY series is not supported yet' });
    }

    if (typeof maxPlayers !== 'undefined' && !(Number.isInteger(Number(maxPlayers)) && Number(maxPlayers) >= MIN_MAX_PLAYERS)) {
      return res.status(400).json({ error: `maxPlayers must be an integer of at least ${MIN_MAX_PLAYERS}` });
    }
    if (typeof sport !== 'undefined' && !SPORT_KEYS.includes(sport)) {
      return res.status(400).json({ error: 'Invalid sport' });
    }
    if (typeof teamSize !== 'undefined' && teamSize !== null && !(Number.isInteger(Number(teamSize)) && Number(teamSize) >= 1)) {
      return res.status(400).json({ error: 'teamSize must be a positive integer or null' });
    }

    const data = {};
    if (typeof title === 'string') data.title = title;
    if (typeof time === 'string') data.time = String(time);
    if (typeof fieldId !== 'undefined') data.fieldId = fieldId || null;
    if (typeof fieldName === 'string') data.fieldName = fieldName;
    if (typeof fieldLocation === 'string') data.fieldLocation = fieldLocation;
    if (typeof price !== 'undefined' && !Number.isNaN(Number(price))) data.price = Number(price);
    if (typeof maxPlayers !== 'undefined') data.maxPlayers = Number(maxPlayers);
    if (typeof autoOpenRegistrationHours !== 'undefined') {
      data.autoOpenRegistrationHours = autoOpenRegistrationHours === null ? null : Number(autoOpenRegistrationHours);
    }
    if (typeof description !== 'undefined') data.description = description === null ? null : String(description);
    if (typeof imageUrl !== 'undefined') data.imageUrl = imageUrl === null ? null : String(imageUrl);
    if (typeof duration !== 'undefined' && !Number.isNaN(Number(duration))) data.duration = Number(duration);
    if (typeof sport !== 'undefined') data.sport = sport;
    if (typeof isOpenToJoin !== 'undefined') data.isOpenToJoin = !!isOpenToJoin;
    if (typeof isFriendsOnly !== 'undefined') data.isFriendsOnly = !!isFriendsOnly;
    if (typeof joinPolicy !== 'undefined') data.joinPolicy = joinPolicy === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : 'INSTANT';
    if (typeof lotteryEnabled !== 'undefined') data.lotteryEnabled = !!lotteryEnabled;
    if (typeof organizerInLottery !== 'undefined') data.organizerInLottery = !!organizerInLottery;
    if (typeof teamSize !== 'undefined') data.teamSize = teamSize === null ? null : Number(teamSize);
    if (typeof welcomeMessage !== 'undefined') {
      // Same treatment createGame applies: strip HTML + cap length; blank means "no welcome message".
      const cleaned = welcomeMessage === null ? null : sanitizeFreeText(String(welcomeMessage), WELCOME_MESSAGE_MAX_LENGTH);
      data.welcomeMessage = cleaned && cleaned.trim() ? cleaned : null;
    }
    // dayOfWeek intentionally blocked when updating existing weekly series (see above)

    const updatedSeries = await prisma.gameSeries.update({
      where: { id: seriesId },
      data
    });

    if (!updateFutureGames) {
      return res.json({ series: updatedSeries });
    }

    // Update future games (>= now) linked to this series
    const now = new Date();
    const futureGames = await prisma.game.findMany({
      where: { seriesId, start: { gte: now } }
    });

    const updates = [];
    for (const g of futureGames) {
      const gd = {};
      if (typeof title === 'string') gd.title = title;
      if (typeof maxPlayers !== 'undefined') gd.maxPlayers = Number(maxPlayers);
      // Game.price is nullable and createGame stores a free game as null, so mirror that here.
      if (typeof data.price !== 'undefined') gd.price = data.price ? Math.round(data.price) : null;
      if (typeof duration !== 'undefined' && !Number.isNaN(Number(duration))) gd.duration = Number(duration);
      if (typeof fieldId !== 'undefined') {
        const newFieldId = fieldId || g.fieldId;
        gd.fieldId = newFieldId;
        // Game (unlike GameSeries) has no fieldName/fieldLocation columns of its own; the API/UI
        // derives display text from the joined Field via fieldId, but customLocation/customLat/customLng
        // (see Game model in schema.prisma) override that display when set (mobile game details prefers
        // customLocation over fieldLocation). Switching to a new field must clear the stale override,
        // otherwise future games keep showing the old spot's text even after fieldId changes.
        if (newFieldId !== g.fieldId) {
          gd.customLocation = null;
          gd.customLat = null;
          gd.customLng = null;
        }
      }
      // fieldName/fieldLocation are free-text edits to the series's own (denormalized) location text;
      // Game has nowhere to store "fieldName" but mirroring the location into customLocation keeps the
      // per-game display in sync since customLocation takes priority over the (unchanged) joined field.
      if (typeof fieldLocation === 'string' || typeof fieldName === 'string') {
        gd.customLocation = fieldLocation || fieldName || null;
      }
      // Time change for WEEKLY: keep the Jerusalem calendar date, replace HH:MM
      if (typeof time === 'string' && series.type === 'WEEKLY') {
        gd.start = parseJerusalemTimeToUTC(formatJerusalemDate(g.start), String(time));
      }

      if (typeof autoOpenRegistrationHours !== 'undefined') {
        const hours = data.autoOpenRegistrationHours; // already processed above
        if (hours === null) {
          gd.registrationOpensAt = null;
        } else {
          const baseStart = gd.start || g.start; // Use new start if changed, else existing
          gd.registrationOpensAt = new Date(baseStart.getTime() - hours * 3600000);
        }
      }
      if (typeof sport !== 'undefined') gd.sport = sport;
      if (typeof isOpenToJoin !== 'undefined') gd.isOpenToJoin = !!isOpenToJoin;
      if (typeof isFriendsOnly !== 'undefined') gd.isFriendsOnly = !!isFriendsOnly;
      if (typeof joinPolicy !== 'undefined') gd.joinPolicy = joinPolicy === 'REQUIRES_APPROVAL' ? 'REQUIRES_APPROVAL' : 'INSTANT';
      if (typeof lotteryEnabled !== 'undefined') gd.lotteryEnabled = !!lotteryEnabled;
      if (typeof organizerInLottery !== 'undefined') gd.organizerInLottery = !!organizerInLottery;
      if (typeof teamSize !== 'undefined') gd.teamSize = data.teamSize;
      if (typeof welcomeMessage !== 'undefined') gd.welcomeMessage = data.welcomeMessage;
      if (Object.keys(gd).length) {
        updates.push(prisma.game.update({ where: { id: g.id }, data: gd }));
      }
    }
    if (updates.length) {
      const updatedGames = await prisma.$transaction(updates);
      for (const g of updatedGames) gameScheduler.resyncGame(g);
    }

    return res.json({ series: updatedSeries, updatedGames: updates.length });
  } catch (e) {
    console.error('Series update error:', e);
    return res.status(500).json({ error: 'Failed to update series' });
  }
});

// Upload series/group image (organizer, manager, or admin)
router.post('/:seriesId/image', authenticateToken, handleSingleUpload(seriesImageUpload, 'image'), async (req, res) => {
  try {
    const { seriesId } = req.params;
    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (!(await canManageSeries(series, req.user))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageUrl = absoluteUrlFor(req, 'series', req.file.filename);
    await prisma.gameSeries.update({ where: { id: seriesId }, data: { imageUrl } });
    if (series.imageUrl) deleteUploadedFile(series.imageUrl);

    res.json({ imageUrl });
  } catch (e) {
    console.error('Series image upload error:', e);
    res.status(500).json({ error: 'Failed to upload series image' });
  }
});

// Remove series/group image (organizer, manager, or admin)
router.delete('/:seriesId/image', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (!(await canManageSeries(series, req.user))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    await prisma.gameSeries.update({ where: { id: seriesId }, data: { imageUrl: null } });
    if (series.imageUrl) deleteUploadedFile(series.imageUrl);

    res.json({ imageUrl: null });
  } catch (e) {
    console.error('Series image remove error:', e);
    res.status(500).json({ error: 'Failed to remove series image' });
  }
});

// Add existing users as series members (organizer / manager)
router.post('/:seriesId/members', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (!(await canManageSeries(series, req.user))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const rawIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const userIds = [...new Set(rawIds.filter((id) => typeof id === 'string' && id && id !== series.organizerId))];
    if (!userIds.length) return res.status(400).json({ error: 'userIds required' });

    const existingUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    const validIds = existingUsers.map((u) => u.id);

    await prisma.$transaction(
      validIds.map((userId) =>
        prisma.seriesParticipant.upsert({
          where: { seriesId_userId: { seriesId, userId } },
          update: {},
          create: { seriesId, userId, role: 'MEMBER' },
        })
      )
    );

    return res.json({ ok: true, added: validIds.length });
  } catch (e) {
    console.error('Series add members error:', e);
    return res.status(500).json({ error: 'Failed to add members' });
  }
});

// Set a member's series role (organizer, a MANAGER participant, or admin). role: MANAGER | MEMBER
router.patch('/:seriesId/members/:userId', authenticateToken, async (req, res) => {
  try {
    const { seriesId, userId } = req.params;
    const role = String(req.body?.role || '').toUpperCase();
    if (role !== 'MANAGER' && role !== 'MEMBER') {
      return res.status(400).json({ error: 'role must be MANAGER or MEMBER' });
    }

    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (!(await canManageSeries(series, req.user))) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (userId === series.organizerId) {
      return res.status(400).json({ error: 'Cannot change the organizer role this way' });
    }

    await prisma.seriesParticipant.upsert({
      where: { seriesId_userId: { seriesId, userId } },
      update: { role },
      create: { seriesId, userId, role },
    });

    return res.json({ ok: true, userId, role });
  } catch (e) {
    console.error('Series member role error:', e);
    return res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Delete a series:
// - Delete all future games for this series (>= now)
// - Detach past games (set seriesId=null) to keep history
// - Remove subscribers
// - Delete the series record
// Delete a series with strategy (POST to avoid body stripping in some envs)
router.post('/:seriesId/delete', authenticateToken, async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { strategy = 'DELETE_ALL', gameIdsToDelete = [] } = req.body || {};
    // strategy: 'DELETE_ALL' | 'KEEP_GAMES' | 'SELECTIVE'

    const series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) return res.status(404).json({ error: 'Series not found' });
    const isAdmin = !!req.user?.isAdmin;
    if (series.organizerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const now = new Date();

    // Fetch future games to decide what to do
    const futureGames = await prisma.game.findMany({
      where: { seriesId, start: { gte: now } },
      select: { id: true }
    });
    const futureIds = futureGames.map(g => g.id);

    let idsToDelete = [];
    let idsToDetach = [];

    if (strategy === 'DELETE_ALL') {
      idsToDelete = futureIds;
    } else if (strategy === 'KEEP_GAMES') {
      idsToDetach = futureIds;
    } else if (strategy === 'SELECTIVE') {
      // Only delete explicit IDs, detach the rest of future
      idsToDelete = futureIds.filter(id => gameIdsToDelete.includes(id));
      idsToDetach = futureIds.filter(id => !gameIdsToDelete.includes(id));
    } else {
      // Fallback default
      idsToDelete = futureIds;
    }

    const ops = [];

    // 1. Delete Targets
    if (idsToDelete.length > 0) {
      // Cascade delete dependencies manually
      ops.push(prisma.participation.deleteMany({ where: { gameId: { in: idsToDelete } } }));
      ops.push(prisma.gameRole.deleteMany({ where: { gameId: { in: idsToDelete } } }));
      ops.push(prisma.team.deleteMany({ where: { gameId: { in: idsToDelete } } }));
      // Chat cleanup
      ops.push(prisma.chatParticipant.deleteMany({ where: { chatId: { in: idsToDelete } } }));
      ops.push(prisma.chatRoom.deleteMany({ where: { id: { in: idsToDelete } } }));
      // Games
      ops.push(prisma.game.deleteMany({ where: { id: { in: idsToDelete } } }));
    }

    // 2. Detach Targets (Future)
    if (idsToDetach.length > 0) {
      ops.push(prisma.game.updateMany({ where: { id: { in: idsToDetach } }, data: { seriesId: null } }));
    }

    // 3. Detach Past Games (Always detach, never delete history automatically here)
    ops.push(prisma.game.updateMany({ where: { seriesId, start: { lt: now } }, data: { seriesId: null } }));

    // 4. Series Cleanup
    ops.push(prisma.seriesParticipant.deleteMany({ where: { seriesId } }));
    ops.push(prisma.gameSeries.delete({ where: { id: seriesId } }));

    await prisma.$transaction(ops);

    if (idsToDelete.length > 0) {
      const io = req.io;
      if (io) {
        io.emit('game:deleted', { gameIds: idsToDelete });
      }
    }

    // Always emit series deleted as the Series object itself is gone
    const io = req.io;
    if (io) {
      io.emit('series:deleted', { seriesId });

      // HEIR PROMOTION: Broadcast the upcoming detached games
      if (idsToDetach.length > 0) {
        try {
          const heir = await prisma.game.findFirst({
            where: {
              id: { in: idsToDetach },
              start: { gt: new Date() }
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

          if (heir) {
            const mapped = mapGameForClient(heir);
            io.emit('game:created', mapped);
          }
        } catch (heirErr) {
          console.error("Failed to promote heir game (series delete)", heirErr);
        }
      }
    }

    return res.json({ ok: true, deletedGames: idsToDelete.length, detachedGames: idsToDetach.length });
  } catch (e) {
    console.error('Series delete error:', e);
    return res.status(500).json({ error: 'Failed to delete series' });
  }
});

module.exports = router;


