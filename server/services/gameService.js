const { PrismaClient, SportType } = require('@prisma/client');
const { NotificationService } = require('./notificationService');
const {
  getActiveGameStartCutoff,
  buildActiveGameStartFilter,
  parseJerusalemTimeToUTC,
} = require('../utils/timezone');
const {
  isGameRatingEligible,
  isConfirmedParticipant,
} = require('../utils/ratings');
const { safeUpsertUserFromAuth } = require('../utils/userSync');
const { notifyUserAddedToGame, notifyUserRemovedFromGame } = require('../utils/addedToGameNotification');

async function sendAutoWelcomeMessage(game, newPlayerId) {
  if (!game || !game.welcomeMessage || !game.organizerId || game.organizerId === newPlayerId) {
    return;
  }
  try {
    // 1. Get or create private chat room between organizer and new player
    let chatRoom = await prisma.chatRoom.findFirst({
      where: {
        type: 'PRIVATE',
        AND: [
          { participants: { some: { userId: game.organizerId } } },
          { participants: { some: { userId: newPlayerId } } }
        ]
      }
    });

    if (!chatRoom) {
      chatRoom = await prisma.chatRoom.create({
        data: {
          type: 'PRIVATE',
          participants: {
            create: [
              { userId: game.organizerId },
              { userId: newPlayerId }
            ]
          }
        }
      });
    }

    // 2. Insert the message
    await prisma.message.create({
      data: {
        chatRoomId: chatRoom.id,
        text: game.welcomeMessage,
        userId: game.organizerId
      }
    });
  } catch (error) {
    console.error('Failed to send auto-welcome message:', error);
  }
}

const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

function httpError(message, status, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function mapGameForClient(game, viewerId) {
  if (!game) return game;
  const allParts = Array.isArray(game?.participants) ? game.participants : [];
  const confirmed = allParts.filter(p => p.status === 'CONFIRMED');
  const waitlisted = allParts.filter(p => p.status === 'WAITLISTED');
  const pending = allParts.filter(p => p.status === 'PENDING');
  const viewerPart = viewerId ? allParts.find(p => p.userId === viewerId) : null;
  const viewerParticipationStatus = viewerPart?.status || null;
  const waitlistOfferPending = viewerPart ? (viewerPart.status === 'PENDING' && !!viewerPart.isWaitlistOffer) : false;
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
  // Organizer is also a drafting manager — include for client-side bench filters.
  const draftingManagerIds = new Set([
    game.organizerId,
    ...managers.map((m) => m.id),
  ].filter(Boolean).map(String));
  const teams = (game?.teams ? game.teams : []).map(t => {
    const playerIds = allParts
      .filter(p => p && p.teamId === t.id)
      .map(p => p.userId)
      .filter(Boolean);
    // Display safety: if a team has a managerId, ensure they appear on the roster
    // even if a stale participation row has not been healed yet.
    if (t.managerId && !playerIds.includes(t.managerId)) {
      playerIds.unshift(t.managerId);
    }
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      managerId: t.managerId || null,
      playerIds: playerIds || []
    };
  });
  const pickTurnOrder = Array.isArray(game.pickTurnOrder)
    ? game.pickTurnOrder.map(String)
    : (typeof game.pickTurnOrder === 'string'
      ? (() => { try { const p = JSON.parse(game.pickTurnOrder); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } })()
      : []);
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
    waitlistOfferPending,
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
    draftingManagerIds: [...draftingManagerIds],
    teams: teams || [],
    sport: game.sport,
    city: game.field?.city || null,
    registrationOpensAt: game.registrationOpensAt ? new Date(game.registrationOpensAt).toISOString() : null,
    chatRoomId: game.id,
    status: game.status,
    pickDrawAt: game.pickDrawAt ? new Date(game.pickDrawAt).toISOString() : null,
    pickDrawExecutedAt: game.pickDrawExecutedAt ? new Date(game.pickDrawExecutedAt).toISOString() : null,
    pickingStartsAt: game.pickingStartsAt ? new Date(game.pickingStartsAt).toISOString() : null,
    pickingOpenedAt: game.pickingOpenedAt ? new Date(game.pickingOpenedAt).toISOString() : null,
    pickSessionStatus: game.pickSessionStatus || 'IDLE',
    pickTurnOrder,
    pickCurrentTurnIndex: game.pickCurrentTurnIndex || 0,
    welcomeMessage: game.welcomeMessage || null,
    managerPickChatId: game.managerPickChatId || null,
  };
}

/** Slim Prisma select for map + list search — avoids nested user joins. */
const SEARCH_GAME_SELECT = {
  id: true,
  title: true,
  sport: true,
  start: true,
  duration: true,
  maxPlayers: true,
  seriesId: true,
  fieldId: true,
  customLat: true,
  customLng: true,
  customLocation: true,
  price: true,
  teamSize: true,
  registrationOpensAt: true,
  joinPolicy: true,
  field: {
    select: {
      id: true,
      name: true,
      location: true,
      city: true,
      lat: true,
      lng: true,
    },
  },
  participants: {
    select: { userId: true, status: true },
  },
};

function mapGameForSearchClient(game, viewerId) {
  const confirmedCount = (game.participants || []).filter((p) => p.status === 'CONFIRMED').length;
  
  let viewerParticipationStatus = null;
  if (viewerId) {
    const viewerPart = (game.participants || []).find((p) => p.userId === viewerId);
    if (viewerPart) {
      viewerParticipationStatus = viewerPart.status;
    }
  }

  return {
    id: game.id,
    title: game.title || null,
    seriesId: game.seriesId || null,
    fieldId: game.fieldId,
    fieldName: game.field?.name || '',
    fieldLocation: game.field?.location || '',
    fieldLat: typeof game.field?.lat === 'number' ? game.field.lat : null,
    fieldLng: typeof game.field?.lng === 'number' ? game.field.lng : null,
    customLat: typeof game.customLat === 'number' ? game.customLat : null,
    customLng: typeof game.customLng === 'number' ? game.customLng : null,
    customLocation: game.customLocation || null,
    start: game.start.toISOString(),
    duration: game.duration,
    maxPlayers: game.maxPlayers,
    currentPlayers: confirmedCount,
    sport: game.sport,
    city: game.field?.city || null,
    price: game.price,
    teamSize: game.teamSize,
    registrationOpensAt: game.registrationOpensAt ? game.registrationOpensAt.toISOString() : null,
    joinPolicy: game.joinPolicy,
    viewerParticipationStatus,
    field: game.field
      ? {
          id: game.field.id,
          name: game.field.name,
          location: game.field.location,
          city: game.field.city,
          lat: game.field.lat,
          lng: game.field.lng,
        }
      : undefined,
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

const ROLE_LEVEL = { NONE: 0, MODERATOR: 1, CAPTAIN: 1, MANAGER: 2, ORGANIZER: 3 };
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

async function offerSpotToNextWaitlistUser(gameId, io) {
  const firstWaitlist = await prisma.participation.findFirst({
    where: { gameId, status: 'WAITLISTED' },
    orderBy: { createdAt: 'asc' }
  });
  if (firstWaitlist) {
    await prisma.participation.update({
      where: { id: firstWaitlist.id },
      data: { status: 'PENDING', isWaitlistOffer: true }
    });

    try {
      notificationService.sendNotification(
        firstWaitlist.userId,
        'GAME_WAITLIST_OFFER',
        'התפנה מקום במשחק!',
        'התפנה מקום במשחק! לחץ כאן כדי לאשר את הצטרפותך',
        { gameId, userId: firstWaitlist.userId, link: `/game/${gameId}` },
        io
      ).catch(err => console.error('[NOTIFICATIONS] Failed to send waitlist offer notification', gameId, err));
    } catch (err) {
      console.error('[NOTIFICATIONS] Fatal validation exception in sendNotification call', gameId, err);
    }

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
  }
}

function notifyOrganizerOfInstantJoin(game, joiningUser, io) {
  if (game.organizerId === joiningUser.id) return;
  notificationService.sendNotification(
    game.organizerId,
    'GAME_JOIN_REQUEST',
    'מישהו הצטרף למשחק שלך',
    `${joiningUser.name || 'משתמש'} הצטרף/ה למשחק שלך`,
    { gameId: game.id, userId: joiningUser.id, link: `/game/${game.id}` },
    io
  ).catch(err => console.error('[NOTIFICATIONS] Failed to notify organizer of join', game.id, err));
}
function notifyOrganizerOfPendingRequest(game, requestingUser, io) {
  notificationService.sendNotification(
    game.organizerId,
    'GAME_JOIN_REQUEST',
    'בקשת הצטרפות חדשה',
    `${requestingUser.name || 'משתמש'} ביקש/ה להצטרף למשחק שלך וממתין/ה לאישורך`,
    { gameId: game.id, userId: requestingUser.id, link: `/game/${game.id}` },
    io
  ).catch(err => console.error('[NOTIFICATIONS] Failed to notify organizer of pending request', game.id, err));
}

function notifyOrganizerOfWaitlistJoin(game, joiningUser, io) {
  if (game.organizerId === joiningUser.id) return;
  notificationService.sendNotification(
    game.organizerId,
    'GAME_JOIN_REQUEST',
    'מישהו נוסף לרשימת ההמתנה',
    `${joiningUser.name || 'משתמש'} הצטרף/ה לרשימת ההמתנה של המשחק שלך`,
    { gameId: game.id, userId: joiningUser.id, link: `/game/${game.id}`, waitlisted: true },
    io
  ).catch(err => console.error('[NOTIFICATIONS] Failed to notify organizer of waitlist join', game.id, err));
}

async function broadcastGameUpdate(io, gameId, preFetchedGame) {
  if (!io || !gameId) return;
  const game = preFetchedGame || await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      field: true,
      participants: { include: { user: true } },
      roles: { include: { user: true } },
      teams: true,
    }
  });
  if (!game) return;

  const recipients = new Set([game.organizerId]);
  (game.participants || []).forEach(p => recipients.add(p.userId));
  (game.roles || []).forEach(r => recipients.add(r.userId));

  recipients.forEach(uid => {
    io.to(`user_${uid}`).emit('game:updated', mapGameForClient(game, uid));
  });
}

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

const GAME_CREATE_INCLUDE = {
  field: true,
  participants: { include: { user: true } },
  roles: { include: { user: true } },
  teams: true,
};

/** Builds the participants-create array for a single game occurrence, respecting capacity. */
function buildOccurrenceParticipants({ organizerId, organizerInLottery, maxPlayers, invitedUserIds, subscriberIds }) {
  const participantsCreate = [{
    userId: organizerId,
    status: organizerInLottery ? 'WAITLISTED' : 'CONFIRMED',
  }];
  const alreadyConfirmed = organizerInLottery ? 0 : 1;
  let remainingSlots = Math.max(0, Number(maxPlayers) - alreadyConfirmed);

  for (const uid of invitedUserIds || []) {
    if (uid === organizerId) continue;
    if (remainingSlots > 0) {
      participantsCreate.push({ userId: uid, status: 'CONFIRMED' });
      remainingSlots -= 1;
    } else {
      participantsCreate.push({ userId: uid, status: 'WAITLISTED' });
    }
  }

  // Subscribers are no longer automatically added to games.
  // They will receive a notification instead.

  return participantsCreate;
}

/**
 * Creates a game (single instance, or a WEEKLY/CUSTOM recurring series) plus its ChatRoom,
 * and triggers the relevant background notifications. Mirrors the previous inline logic that
 * lived in `POST /api/games`. Throws an Error with a `.status` (and optional `.details`) on
 * validation/lookup failures so the route layer can translate it into an HTTP response.
 */
async function createGame(payload, creatorUser, io) {
  const {
    fieldId: rawFieldId,
    newField: rawNewField,
    date,
    time: rawTime,
    start: payloadStart,
    duration: rawDuration,
    maxPlayers: rawMaxPlayers,
    isOpenToJoin,
    isFriendsOnly,
    lotteryEnabled,
    lotteryAt,
    organizerInLottery,
    description,
    welcomeMessage,
    recurrence,
    customLng,
    customLocation,
    sport,
    registrationOpensAt,
    title,
    friendsOnlyUntil,
    teamSize,
    price: rawPrice,
    customLat,
    joinPolicy,
    invitedParticipantIds,
    pickDrawAt,
    pickingStartsAt,
    seriesId,
  } = payload || {};

  // When the caller attaches this game to an existing series, only the series organizer,
  // a series MANAGER, or an admin may prefill/attach to it.
  let series = null;
  if (seriesId) {
    series = await prisma.gameSeries.findUnique({ where: { id: seriesId } });
    if (!series) throw httpError('Series not found', 404);
    const isAdmin = !!creatorUser?.isAdmin;
    let isManager = false;
    if (series.organizerId !== creatorUser.id && !isAdmin) {
      const seriesParticipant = await prisma.seriesParticipant.findUnique({
        where: { seriesId_userId: { seriesId, userId: creatorUser.id } }
      });
      isManager = seriesParticipant?.role === 'MANAGER';
    }
    if (series.organizerId !== creatorUser.id && !isAdmin && !isManager) {
      throw httpError('Not allowed', 403);
    }
  }

  const latNum = typeof customLat === 'undefined' ? NaN : parseFloat(String(customLat));
  const lngNum = typeof customLng === 'undefined' ? NaN : parseFloat(String(customLng));

  // Series defaults apply only to fields the caller left unset, so an explicit field/date/time
  // choice on this game always wins over the series' stored defaults.
  const hasFieldOverride = !!rawFieldId || !!rawNewField || (Number.isFinite(latNum) && Number.isFinite(lngNum));
  let fieldId = rawFieldId;
  let newField = rawNewField;
  if (!hasFieldOverride && series) {
    if (series.fieldId) {
      fieldId = series.fieldId;
    } else if (series.fieldName || series.fieldLocation) {
      newField = { name: series.fieldName, location: series.fieldLocation };
    }
  }
  const time = (!rawTime && !payloadStart && series) ? series.time : rawTime;
  const duration = (typeof rawDuration === 'undefined' || rawDuration === null || rawDuration === '')
    ? (series ? series.duration : rawDuration)
    : rawDuration;
  const maxPlayers = (typeof rawMaxPlayers === 'undefined' || rawMaxPlayers === null || rawMaxPlayers === '')
    ? (series ? series.maxPlayers : rawMaxPlayers)
    : rawMaxPlayers;
  const price = (typeof rawPrice === 'undefined' || rawPrice === null || rawPrice === '')
    ? (series ? series.price : rawPrice)
    : rawPrice;

  const invitedUserIds = Array.isArray(invitedParticipantIds)
    ? invitedParticipantIds.filter(id => typeof id === 'string' && id !== creatorUser.id)
    : [];
  const hasFieldId = !!fieldId;
  const hasNewFieldText = !!(newField && (String(newField.name || '').trim() || String(newField.location || '').trim()));
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const hasStart = !!payloadStart;
  const hasDate = !!date;
  const hasTime = !!time;
  const hasMaxPlayers = !!maxPlayers;

  if (!(hasFieldId || hasNewFieldText || hasCoords) || (!hasStart && (!hasDate || !hasTime)) || !hasMaxPlayers) {
    console.warn('Create game validation failed', {
      bodyKeys: Object.keys(payload || {}),
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
    throw httpError('Missing required fields', 400, { hasFieldId, hasNewFieldText, hasCoords, hasDate, hasTime, hasMaxPlayers });
  }

  let useFieldId = fieldId;

  // If client requested to create a new field inline or provided only coordinates,
  // create a minimal (unlisted) field to attach the game to.
  if (!useFieldId && (newField || (Number.isFinite(latNum) && Number.isFinite(lngNum)))) {
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
        type: 'OPEN',
        ...(Number.isFinite(latNum) ? { lat: latNum } : {}),
        ...(Number.isFinite(lngNum) ? { lng: lngNum } : {}),
      }
    });
    useFieldId = createdField.id;
  }

  const field = await prisma.field.findUnique({ where: { id: useFieldId } });
  if (!field) throw httpError('Field not found', 404);

  await safeUpsertUserFromAuth(prisma, creatorUser);

  const start = payloadStart ? new Date(payloadStart) : parseJerusalemTimeToUTC(date, time);

  // Recurrence handling (flexible: WEEKLY or CUSTOM). Returns the first generated instance;
  // no ChatRoom / notifications are created for recurring series via this endpoint.
  const isRecurring = !!recurrence && (recurrence.type || recurrence.isRecurring);
  if (isRecurring) {
    const type = String(recurrence?.type || 'WEEKLY').toUpperCase();
    const weekly = type === 'WEEKLY';

    let autoOpenRegistrationHours = null;
    if (registrationOpensAt) {
      const diffMs = start.getTime() - new Date(registrationOpensAt).getTime();
      autoOpenRegistrationHours = diffMs / (1000 * 60 * 60);
    }

    const series = await prisma.gameSeries.create({
      data: {
        title,
        organizerId: creatorUser.id,
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
        const participantsCreate = buildOccurrenceParticipants({
          organizerId: creatorUser.id,
          organizerInLottery,
          maxPlayers,
          invitedUserIds,
          subscriberIds,
        });

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
              welcomeMessage: welcomeMessage || null,
              organizerId: creatorUser.id,
              participants: { create: participantsCreate },
              roles: { create: { userId: creatorUser.id, role: 'ORGANIZER' } },
              sport: sport || 'SOCCER',
              registrationOpensAt: instanceRegOpen,
              friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null,
              teamSize: teamSize ? parseInt(teamSize) : null,
              price: price ? parseInt(price) : null
            },
            include: GAME_CREATE_INCLUDE,
          })
        );
      }
    } else {
      // CUSTOM: create per provided dates
      const dateStrs = Array.isArray(recurrence?.dates) ? recurrence.dates : [];
      if (!dateStrs.length) {
        throw httpError('CUSTOM recurrence requires dates[]', 400);
      }
      for (const ds of dateStrs) {
        const occStart = new Date(String(ds));
        if (isNaN(occStart.getTime())) continue;
        const participantsCreate = buildOccurrenceParticipants({
          organizerId: creatorUser.id,
          organizerInLottery,
          maxPlayers,
          invitedUserIds,
          subscriberIds,
        });
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
              organizerId: creatorUser.id,
              participants: { create: participantsCreate },
              roles: { create: { userId: creatorUser.id, role: 'ORGANIZER' } },
              sport: sport || 'SOCCER',
              registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null,
              friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null,
              teamSize: teamSize ? parseInt(teamSize) : null,
              price: price ? parseInt(price) : null
            },
            include: GAME_CREATE_INCLUDE,
          })
        );
      }
    }

    const createdGames = await prisma.$transaction(createOps);
    const firstGame = createdGames[0];
    // Notify invited friends about the first occurrence (same copy as single-game create).
    if (firstGame && invitedUserIds.length) {
      for (const invitedId of invitedUserIds) {
        notifyUserAddedToGame(notificationService, {
          userId: invitedId,
          adderName: creatorUser.name,
          adderId: creatorUser.id,
          game: firstGame,
          io,
        });
      }
    }

    // Notify series subscribers that a new game has been created
    if (firstGame && subscriberIds && subscriberIds.length) {
      for (const subscriberId of subscriberIds) {
        if (subscriberId === creatorUser.id) continue;
        
        const regText = firstGame.registrationOpensAt 
          ? `ההרשמה תיפתח ב-${new Date(firstGame.registrationOpensAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` 
          : 'ההרשמה פתוחה כעת';
          
        notificationService.sendNotification(
          subscriberId,
          'NEW_GAME_IN_CITY', // Use existing type
          `משחק חדש לקבוצה שלך נוצר!`,
          `${firstGame.title || 'משחק'} נוצר עבור הקבוצה שלך. ${regText}. לחץ כאן כדי להירשם!`,
          { gameId: firstGame.id, link: `/games/${firstGame.id}` }
        );
      }
    }

    return firstGame;
  }

  // Single instance flow (original behavior) with basic conflict check
  const conflict = await prisma.game.findFirst({ where: { fieldId: useFieldId, start } });
  if (conflict) {
    throw httpError('Time slot is already booked', 400);
  }

  // Transactional creation of Game + ChatRoom
  const created = await prisma.$transaction(async (tx) => {
    const game = await tx.game.create({
      data: {
        title,
        fieldId: useFieldId,
        ...(series ? { seriesId: series.id } : {}),
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
        ...(pickDrawAt ? { pickDrawAt: new Date(String(pickDrawAt)), pickSessionStatus: 'DRAW_SCHEDULED' } : {}),
        ...(pickingStartsAt ? { pickingStartsAt: new Date(String(pickingStartsAt)) } : {}),
        description: description || '',
        welcomeMessage: welcomeMessage || null,
        organizerId: creatorUser.id,
        // Organizer: confirmed by default, or waitlisted if included in lottery
        participants: {
          create: [
            {
              userId: creatorUser.id,
              status: organizerInLottery ? 'WAITLISTED' : 'CONFIRMED'
            },
            ...invitedUserIds.map(uid => ({
              userId: uid,
              status: 'CONFIRMED'
            }))
          ]
        },
        roles: {
          create: { userId: creatorUser.id, role: 'ORGANIZER' }
        },
        sport: sport || 'SOCCER',
        registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null,
        friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null
      },
      include: GAME_CREATE_INCLUDE,
    });

    // Create ChatRoom immediately within transaction
    await tx.chatRoom.create({
      data: {
        id: game.id,
        type: 'GROUP',
        participants: {
          create: [
            { userId: creatorUser.id },
            ...invitedUserIds.map(uid => ({ userId: uid }))
          ]
        }
      }
    });

    return game;
  });

  // Viewer-agnostic payload for broadcasting to other users (city/friends rooms) — must not
  // carry the creator's own viewerParticipationStatus, since it would be misleading for them.
  const gamePayload = mapGameForClient(created);

  // Socket Notifications (Targeted Delta Update)
  if (io) {
    // 1. Notify City (live update for anyone currently connected & subscribed to the city room)
    if (created.field?.city) {
      io.to(`city_${created.field.city}`).emit('game:created', gamePayload);
    }

    // 2. Notify Friends
    try {
      const userWithFriends = await prisma.user.findUnique({
        where: { id: creatorUser.id },
        include: { friendshipsA: true, friendshipsB: true }
      });
      const friendIds = [
        ...(userWithFriends?.friendshipsA || []).map(f => f.userBId),
        ...(userWithFriends?.friendshipsB || []).map(f => f.userAId)
      ];
      friendIds.forEach(fid => {
        io.to(`user_${fid}`).emit('game:created', gamePayload);
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
        id: { not: creatorUser.id }
      },
      select: { id: true }
    }).then(cityUsers => {
      cityUsers.forEach(u => {
        notificationService.sendNotification(
          u.id,
          'NEW_GAME_IN_CITY',
          `משחק חדש ב${created.field.city}`,
          `${creatorUser.name || 'מישהו'} פתח/ה משחק חדש ב${cityGameName}`,
          { gameId: created.id, city: created.field.city, link: `/game/${created.id}` },
          io
        ).catch(err => console.error('[NOTIFICATIONS] Failed to notify city user', u.id, err));
      });
    }).catch(err => console.error('[NOTIFICATIONS] Failed to query city users', err));
  }

  // 4. Friends invited at create-time get the same immediate "added to game" notification
  // as when a manager adds them later via POST /participants.
  for (const invitedId of invitedUserIds) {
    notifyUserAddedToGame(notificationService, {
      userId: invitedId,
      adderName: creatorUser.name,
      adderId: creatorUser.id,
      game: created,
      io,
    });
  }

  return created;
}

/**
 * Runs the full games search: text/city/sport/open-to-join filters, spatial bounding-box
 * filtering, and the extended (2nd-degree) social-network Recursive CTE lookup. Returns
 * client-ready mapped results (via `mapGameForSearchClient`), deduplicated by series.
 */
async function searchGames(queryParams, viewerId) {
  const { fieldId, date, isOpenToJoin, q, city, minLat, maxLat, minLng, maxLng, sport, networkGames } = queryParams || {};
  const where = {};
  if (fieldId) where.fieldId = String(fieldId);
  if (typeof isOpenToJoin !== 'undefined') where.isOpenToJoin = String(isOpenToJoin) === 'true';

  // Handle Extended Social Network (Recursive CTE for 2nd degree friends)
  if (networkGames === 'true' && viewerId) {
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
    where.start = buildActiveGameStartFilter(date);
  } else {
    // Filter out games that started more than 30 minutes ago.
    where.start = { gte: getActiveGameStartCutoff() };
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

  const visibility = buildVisibilityWhere(viewerId);
  // Combine base visibility rules with query rules
  const finalWhere = where.AND ? { AND: [visibility, ...where.AND] } : { AND: [visibility, where] };

  const games = await prisma.game.findMany({
    where: finalWhere,
    select: SEARCH_GAME_SELECT,
    orderBy: { start: 'asc' }
  });

  const deduped = deduplicateSeriesGames(games);
  return deduped.map((g) => mapGameForSearchClient(g, viewerId));
}

const GAME_FULL_INCLUDE = {
  field: true,
  participants: { include: { user: true } },
  roles: { include: { user: true } },
  teams: true,
};

const GAME_DETAIL_INCLUDE = {
  field: true,
  participants: { include: { user: true, team: true } },
  roles: { include: { user: true } },
  teams: true,
};

async function convertGameToSeries(gameId, copyParticipants, creatorUserId, isAdmin, io) {
  const existing = await prisma.game.findUnique({
    where: { id: gameId },
    include: { field: true, participants: true, roles: true }
  });
  if (!existing) throw httpError('Game not found', 404);
  if (existing.seriesId) throw httpError('Game is already part of a series', 400);

  const level = await getRoleLevel(gameId, creatorUserId);
  if (level < ROLE_LEVEL.ORGANIZER && !isAdmin) {
    throw httpError('Not allowed', 403);
  }

  const start = new Date(existing.start);
  const hh = String(start.getHours()).padStart(2, '0');
  const mi = String(start.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mi}`;

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
      sport: existing.sport,
      autoOpenRegistrationHours: existing.registrationOpensAt
        ? (start.getTime() - new Date(existing.registrationOpensAt).getTime()) / 3600000
        : null
    },
  });

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

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: { seriesId: series.id },
    include: GAME_FULL_INCLUDE,
  });

  const subs = await prisma.seriesParticipant.findMany({
    where: { seriesId: series.id },
    select: { userId: true }
  });
  const subscriberIds = Array.from(new Set((subs || []).map(s => s.userId).filter(Boolean)));

  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const createOps = [];
  for (let i = 1; i <= 4; i++) {
    const occStart = new Date(start.getTime() + i * oneWeekMs);
    const participantsCreate = buildOccurrenceParticipants({
      organizerId: existing.organizerId,
      organizerInLottery: existing.organizerInLottery,
      maxPlayers: existing.maxPlayers,
      invitedUserIds: [],
      subscriberIds,
    });

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
          sport: existing.sport,
          registrationOpensAt: (existing.registrationOpensAt)
            ? new Date(occStart.getTime() - (start.getTime() - new Date(existing.registrationOpensAt).getTime()))
            : null
        },
        include: GAME_FULL_INCLUDE,
      })
    );
  }

  const createdGames = await prisma.$transaction(createOps);

  const seriesPayload = {
    id: series.id,
    name: series.title || 'Series',
    fieldName: series.fieldName,
    time: series.time,
    dayOfWeek: series.dayOfWeek,
    subscriberCount: subscriberIds.length,
    sport: series.sport,
    subscriberIds,
  };

  if (io) {
    io.emit('series:created', seriesPayload);
  }

  // Notify subscribers about the newly created future games
  if (subscriberIds && subscriberIds.length) {
    for (const g of createdGames) {
      const regText = g.registrationOpensAt 
        ? `ההרשמה תיפתח ב-${new Date(g.registrationOpensAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` 
        : 'ההרשמה פתוחה כעת';
      for (const subscriberId of subscriberIds) {
        if (subscriberId === creatorUserId) continue;
        notificationService.sendNotification(
          subscriberId,
          'NEW_GAME_IN_CITY',
          `משחק חדש לקבוצה שלך נוצר!`,
          `${g.title || 'משחק'} נוצר עבור הקבוצה שלך. ${regText}. לחץ כאן כדי להירשם!`,
          { gameId: g.id, link: `/games/${g.id}` }
        );
      }
    }
  }

  return {
    game: mapGameForClient(updated, creatorUserId),
    created: createdGames.map(g => mapGameForClient(g, creatorUserId)),
    seriesId: series.id,
  };
}

/**
 * Resolve an existing fieldId or create a new Field from newField / custom coords.
 * Returns null when the body does not request a location change.
 */
async function resolveFieldUpdateFromBody(body) {
  const { fieldId, newField, customLat, customLng, customLocation } = body || {};
  const latNum = typeof customLat === 'undefined' ? NaN : parseFloat(String(customLat));
  const lngNum = typeof customLng === 'undefined' ? NaN : parseFloat(String(customLng));
  const hasFieldId = !!fieldId;
  const hasNewFieldText = !!(newField && (String(newField.name || '').trim() || String(newField.location || '').trim()));
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);

  if (!hasFieldId && !hasNewFieldText && !hasCoords) {
    return null;
  }

  let useFieldId = hasFieldId ? String(fieldId) : null;

  if (!useFieldId && (newField || hasCoords)) {
    const fallbackCoords = hasCoords ? `${latNum.toFixed(5)}, ${lngNum.toFixed(5)}` : '';
    const name = (newField?.name && String(newField.name).trim())
      || (customLocation && String(customLocation).trim())
      || `Custom spot ${fallbackCoords}`;
    const location = (newField?.location && String(newField.location).trim())
      || (customLocation && String(customLocation).trim())
      || fallbackCoords
      || 'Custom';
    const createdField = await prisma.field.create({
      data: {
        name,
        location,
        price: 0,
        rating: 0,
        image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
        available: false,
        type: 'OPEN',
        ...(Number.isFinite(latNum) ? { lat: latNum } : {}),
        ...(Number.isFinite(lngNum) ? { lng: lngNum } : {}),
      },
    });
    useFieldId = createdField.id;
  }

  const field = await prisma.field.findUnique({ where: { id: useFieldId } });
  if (!field) throw httpError('Field not found', 404);

  return {
    fieldId: useFieldId,
    ...(typeof customLat !== 'undefined' ? { customLat: Number.isFinite(latNum) ? latNum : null } : {}),
    ...(typeof customLng !== 'undefined' ? { customLng: Number.isFinite(lngNum) ? lngNum : null } : {}),
    ...(typeof customLocation !== 'undefined' ? { customLocation: customLocation || null } : {}),
  };
}

async function patchGame(gameId, body, userId, io) {
  const {
    time, date, start, maxPlayers, sport, registrationOpensAt,
    title, friendsOnlyUntil, isFriendsOnly, teamSize, joinPolicy,
    pickDrawAt, pickingStartsAt, duration, description, welcomeMessage, price,
  } = body || {};

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: GAME_DETAIL_INCLUDE,
  });
  if (!game) throw httpError('Game not found', 404);

  const level = await getRoleLevel(gameId, userId);
  const isOrganizer = game.organizerId === userId;
  if (!isOrganizer && level < ROLE_LEVEL.MANAGER) {
    throw httpError('Not allowed', 403);
  }

  const updates = {};
  if (start) {
    const parsedStart = new Date(start);
    if (!Number.isNaN(parsedStart.getTime())) {
      updates.start = parsedStart;
    }
  } else {
    if (typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)) {
      const [hhStr, mmStr] = time.split(':');
      const hh = parseInt(hhStr, 10);
      const mm = parseInt(mmStr, 10);
      if (Number.isInteger(hh) && Number.isInteger(mm)) {
        const newStart = new Date(game.start);
        newStart.setHours(hh, mm, 0, 0);
        updates.start = newStart;
      }
    }
    if (typeof date === 'string') {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        const newStart = new Date(updates.start || game.start);
        newStart.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        updates.start = newStart;
      }
    }
  }

  if (maxPlayers !== undefined) {
    const mp = parseInt(maxPlayers, 10);
    if (!isNaN(mp) && mp > 0) updates.maxPlayers = mp;
  }

  if (teamSize !== undefined) {
    const ts = parseInt(teamSize, 10);
    if (!isNaN(ts) && ts > 0) updates.teamSize = ts;
    else if (teamSize === null) updates.teamSize = null;
  }

  if (typeof sport === 'string') {
    const s = sport.toUpperCase();
    if (Object.values(SportType).includes(s)) updates.sport = s;
  }

  if (registrationOpensAt !== undefined) {
    updates.registrationOpensAt = registrationOpensAt ? new Date(registrationOpensAt) : null;
  }
  if (typeof title !== 'undefined') updates.title = title;
  if (friendsOnlyUntil !== undefined) {
    updates.friendsOnlyUntil = friendsOnlyUntil ? new Date(friendsOnlyUntil) : null;
  }
  if (typeof isFriendsOnly === 'boolean') updates.isFriendsOnly = isFriendsOnly;
  if (joinPolicy === 'INSTANT' || joinPolicy === 'REQUIRES_APPROVAL') {
    updates.joinPolicy = joinPolicy;
  }
  if (typeof duration !== 'undefined') {
    const d = Number(duration);
    if (!Number.isNaN(d) && d > 0) updates.duration = d;
  }
  if (typeof description !== 'undefined') updates.description = description || '';
  if (typeof welcomeMessage !== 'undefined') updates.welcomeMessage = welcomeMessage || null;
  if (typeof price !== 'undefined') {
    updates.price = price === null || price === '' ? null : Number(price);
  }

  const fieldUpdate = await resolveFieldUpdateFromBody(body);
  if (fieldUpdate) Object.assign(updates, fieldUpdate);

  // Organizer-only pick schedule (also editable via dedicated pick-session route)
  if (isOrganizer) {
    if (typeof pickDrawAt !== 'undefined') {
      updates.pickDrawAt = pickDrawAt ? new Date(String(pickDrawAt)) : null;
      if (updates.pickDrawAt && updates.pickDrawAt > new Date()) {
        updates.pickDrawExecutedAt = null;
        updates.pickSessionStatus = 'DRAW_SCHEDULED';
        updates.pickTurnOrder = null;
        updates.pickCurrentTurnIndex = 0;
      } else if (updates.pickDrawAt) {
        updates.pickSessionStatus = 'DRAW_SCHEDULED';
      } else if (!game.pickDrawExecutedAt) {
        updates.pickSessionStatus = 'IDLE';
      }
    }
    if (typeof pickingStartsAt !== 'undefined') {
      updates.pickingStartsAt = pickingStartsAt ? new Date(String(pickingStartsAt)) : null;
      if (updates.pickingStartsAt && updates.pickingStartsAt > new Date()) {
        updates.pickingOpenedAt = null;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    throw httpError('No valid fields to update', 400);
  }

  const updated = await prisma.game.update({
    where: { id: gameId },
    data: updates,
    include: GAME_DETAIL_INCLUDE,
  });
  broadcastGameUpdate(io, gameId, updated).catch(err =>
    console.error('[SOCKET] Failed to broadcast game update', gameId, err)
  );
  return mapGameForClient(updated, userId);
}

async function updateGame(gameId, body, userId, io) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw httpError('Game not found', 404);
  if (game.organizerId !== userId) {
    throw httpError('Only organizer can update game', 403);
  }

  const {
    description, welcomeMessage, isOpenToJoin, maxPlayers, lotteryEnabled, lotteryAt,
    organizerInLottery, title, sport, duration, teamSize, price,
    isFriendsOnly, joinPolicy, registrationOpensAt, friendsOnlyUntil, start,
    pickDrawAt, pickingStartsAt,
  } = body || {};

  if (typeof maxPlayers !== 'undefined') {
    const confirmedCount = await prisma.participation.count({
      where: { gameId: game.id, status: 'CONFIRMED' },
    });
    if (Number(maxPlayers) < confirmedCount) {
      throw httpError('Max players cannot be less than current players', 400);
    }
  }

  const pickScheduleUpdates = {};
  if (typeof pickDrawAt !== 'undefined') {
    pickScheduleUpdates.pickDrawAt = pickDrawAt ? new Date(String(pickDrawAt)) : null;
    if (pickScheduleUpdates.pickDrawAt && pickScheduleUpdates.pickDrawAt > new Date()) {
      pickScheduleUpdates.pickDrawExecutedAt = null;
      pickScheduleUpdates.pickSessionStatus = 'DRAW_SCHEDULED';
      pickScheduleUpdates.pickTurnOrder = null;
      pickScheduleUpdates.pickCurrentTurnIndex = 0;
    } else if (pickScheduleUpdates.pickDrawAt) {
      pickScheduleUpdates.pickSessionStatus = 'DRAW_SCHEDULED';
    } else if (!game.pickDrawExecutedAt) {
      pickScheduleUpdates.pickSessionStatus = 'IDLE';
    }
  }
  if (typeof pickingStartsAt !== 'undefined') {
    pickScheduleUpdates.pickingStartsAt = pickingStartsAt ? new Date(String(pickingStartsAt)) : null;
    if (pickScheduleUpdates.pickingStartsAt && pickScheduleUpdates.pickingStartsAt > new Date()) {
      pickScheduleUpdates.pickingOpenedAt = null;
    }
  }

  const fieldUpdate = await resolveFieldUpdateFromBody(body);

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: {
      ...(typeof description !== 'undefined' ? { description: description || '' } : {}),
      ...(typeof welcomeMessage !== 'undefined' ? { welcomeMessage: welcomeMessage || null } : {}),
      ...(typeof isOpenToJoin !== 'undefined' ? { isOpenToJoin: !!isOpenToJoin } : {}),
      ...(typeof maxPlayers !== 'undefined' ? { maxPlayers: Number(maxPlayers) } : {}),
      ...(typeof lotteryEnabled !== 'undefined' ? { lotteryEnabled: !!lotteryEnabled } : {}),
      ...(typeof organizerInLottery !== 'undefined' ? { organizerInLottery: !!organizerInLottery } : {}),
      ...(typeof lotteryAt !== 'undefined' ? { lotteryAt: lotteryAt ? new Date(String(lotteryAt)) : null } : {}),
      ...(typeof title !== 'undefined' ? { title: title || null } : {}),
      ...(typeof sport === 'string' ? { sport: sport.toUpperCase() } : {}),
      ...(typeof duration !== 'undefined' ? { duration: Number(duration) } : {}),
      ...(typeof teamSize !== 'undefined' ? { teamSize: teamSize ? Number(teamSize) : null } : {}),
      ...(typeof price !== 'undefined' ? { price: price ? Number(price) : null } : {}),
      ...(typeof isFriendsOnly !== 'undefined' ? { isFriendsOnly: !!isFriendsOnly } : {}),
      ...(typeof joinPolicy !== 'undefined' ? { joinPolicy } : {}),
      ...(typeof registrationOpensAt !== 'undefined'
        ? { registrationOpensAt: registrationOpensAt ? new Date(registrationOpensAt) : null }
        : {}),
      ...(typeof friendsOnlyUntil !== 'undefined'
        ? { friendsOnlyUntil: friendsOnlyUntil ? new Date(friendsOnlyUntil) : null }
        : {}),
      ...(typeof start !== 'undefined' ? { start: new Date(start) } : {}),
      ...(fieldUpdate || {}),
      ...pickScheduleUpdates,
    },
    include: { field: true, participants: { include: { user: true } }, roles: { include: { user: true } }, teams: true },
  });
  broadcastGameUpdate(io, gameId, updated).catch(err =>
    console.error('[SOCKET] Failed to broadcast game update', gameId, err)
  );
  return mapGameForClient(updated, userId);
}

async function deleteGame(gameId, userId, isAdmin, io) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw httpError('Game not found', 404);
  if (game.organizerId !== userId && !isAdmin) {
    throw httpError('Only organizer or admin can delete game', 403);
  }

  await prisma.$transaction([
    prisma.playerTrade.deleteMany({ where: { gameId } }),
    prisma.participation.deleteMany({ where: { gameId } }),
    prisma.gameRole.deleteMany({ where: { gameId } }),
    prisma.team.deleteMany({ where: { gameId } }),
    prisma.chatParticipant.deleteMany({ where: { chatId: gameId } }),
    prisma.chatRoom.deleteMany({ where: { id: gameId } }),
    ...(game.managerPickChatId
      ? [
          prisma.chatParticipant.deleteMany({ where: { chatId: game.managerPickChatId } }),
          prisma.chatRoom.deleteMany({ where: { id: game.managerPickChatId } }),
        ]
      : []),
    prisma.game.delete({ where: { id: gameId } }),
  ]);

  if (io) {
    io.emit('game:deleted', { gameIds: [gameId] });

    if (game.seriesId) {
      try {
        const nextGame = await prisma.game.findFirst({
          where: {
            seriesId: game.seriesId,
            start: { gt: new Date() },
            id: { not: gameId },
          },
          orderBy: { start: 'asc' },
          include: GAME_FULL_INCLUDE,
        });
        if (nextGame) {
          io.emit('game:created', mapGameForClient(nextGame));
        }
      } catch (heirError) {
        console.error('Failed to promote heir game', heirError);
      }
    }
  }

  return { message: 'Game deleted successfully' };
}

async function getPublicGames(query, viewerId) {
  const { fieldId, date, isOpenToJoin } = query || {};
  const where = {
    AND: [
      { status: 'OPEN' },
      {
        OR: [
          { isFriendsOnly: false },
          { friendsOnlyUntil: { lte: new Date() } },
        ],
      },
    ],
  };
  if (fieldId) where.AND.push({ fieldId: String(fieldId) });
  if (typeof isOpenToJoin !== 'undefined') {
    where.AND.push({ isOpenToJoin: String(isOpenToJoin) === 'true' });
  }
  if (date) {
    where.AND.push({ start: buildActiveGameStartFilter(date) });
  } else {
    where.AND.push({ start: { gte: getActiveGameStartCutoff() } });
  }

  const games = await prisma.game.findMany({
    where,
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return deduplicateSeriesGames(games).map(g => mapGameForClient(g, viewerId));
}

async function getMyGames(userId) {
  const cutoff = getActiveGameStartCutoff();
  const games = await prisma.game.findMany({
    where: {
      AND: [
        { status: 'OPEN' },
        { start: { gte: cutoff } },
        {
          OR: [
            { participants: { some: { userId } } },
            { organizerId: userId },
          ],
        },
      ],
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return deduplicateSeriesGames(games).map(g => mapGameForClient(g, userId));
}

async function getMyHistory(userId) {
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { participants: { some: { userId } } },
        { organizerId: userId },
      ],
      status: 'COMPLETED',
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'desc' },
    take: 50,
  });
  return games.map(g => mapGameForClient(g, userId));
}

async function getFriendsGames(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      friendshipsA: { select: { userBId: true } },
      friendshipsB: { select: { userAId: true } },
    },
  });
  if (!user) throw httpError('User not found', 404);

  const friendIds = [
    ...(user.friendshipsA || []).map(f => f.userBId),
    ...(user.friendshipsB || []).map(f => f.userAId),
  ];
  if (friendIds.length === 0) return [];

  const games = await prisma.game.findMany({
    where: {
      AND: [
        buildVisibilityWhere(userId),
        { start: { gte: getActiveGameStartCutoff() } },
        { participants: { some: { userId: { in: friendIds } } } },
        { participants: { none: { userId } } },
      ],
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return deduplicateSeriesGames(games).map(g => mapGameForClient(g, userId));
}

async function getCityGames(city, viewerId) {
  if (!city) return [];
  const games = await prisma.game.findMany({
    where: {
      AND: [
        buildVisibilityWhere(viewerId),
        { start: { gte: getActiveGameStartCutoff() } },
        { field: { city: { equals: String(city), mode: 'insensitive' } } },
      ],
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return deduplicateSeriesGames(games).map(g => mapGameForClient(g, viewerId));
}

async function getAllGames(viewerId) {
  const games = await prisma.game.findMany({
    where: {
      AND: [
        buildVisibilityWhere(viewerId),
        { start: { gte: getActiveGameStartCutoff() } },
      ],
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return games.map(g => mapGameForClient(g, viewerId));
}

async function getGamesByField(fieldId, viewerId) {
  const games = await prisma.game.findMany({
    where: {
      AND: [
        buildVisibilityWhere(viewerId),
        { fieldId },
        { start: { gte: getActiveGameStartCutoff() } },
      ],
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return games.map(g => mapGameForClient(g, viewerId));
}

async function getGamesByDate(date, viewerId) {
  const games = await prisma.game.findMany({
    where: {
      AND: [
        buildVisibilityWhere(viewerId),
        { start: buildActiveGameStartFilter(date) },
      ],
    },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return games.map(g => mapGameForClient(g, viewerId));
}

async function getTodayCityGames(city, viewerId) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const where = {
    start: buildActiveGameStartFilter(todayStr),
    ...(city ? { field: { city: { equals: String(city), mode: 'insensitive' } } } : {}),
  };
  const games = await prisma.game.findMany({
    where: { AND: [buildVisibilityWhere(viewerId), where] },
    include: { field: true, participants: { include: { user: true } } },
    orderBy: { start: 'asc' },
  });
  return games.map(g => mapGameForClient(g, viewerId));
}

async function getGameById(gameId, viewerId) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: GAME_DETAIL_INCLUDE,
  });
  if (!game) throw httpError('Game not found', 404);

  const chatRoom = await prisma.chatRoom.findUnique({ where: { id: game.id } });
  if (!chatRoom) {
    console.log(`[Self-Healing] Creating missing ChatRoom for game ${game.id}`);
    try {
      await prisma.chatRoom.create({
        data: {
          id: game.id,
          type: 'GROUP',
          participants: { create: { userId: game.organizerId } },
        },
      });
    } catch (e) {
      console.error('Failed to self-heal chat room', e);
    }
  }

  return mapGameForClient(game, viewerId);
}

async function getGameRatings(gameId, viewerId) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, start: true, status: true },
  });
  if (!game) throw httpError('Game not found', 404);

  const viewerConfirmed = await isConfirmedParticipant(gameId, viewerId);
  if (!viewerConfirmed) {
    throw httpError('Only confirmed participants can view ratings', 403);
  }

  if (!isGameRatingEligible(game)) {
    return { eligible: false, teammates: [] };
  }

  const [parts, existing] = await Promise.all([
    prisma.participation.findMany({
      where: { gameId, status: 'CONFIRMED', userId: { not: viewerId } },
      select: { user: { select: { id: true, name: true, imageUrl: true } } },
    }),
    prisma.userRating.findMany({
      where: { gameId, raterId: viewerId },
      select: { targetId: true, score: true },
    }),
  ]);

  const scoreByTarget = Object.fromEntries(existing.map(r => [r.targetId, r.score]));
  return {
    eligible: true,
    teammates: parts.map(p => ({
      id: p.user.id,
      name: p.user.name,
      imageUrl: p.user.imageUrl,
      myScore: scoreByTarget[p.user.id] ?? null,
    })),
  };
}

module.exports = {
  prisma,
  notificationService,
  mapGameForClient,
  SEARCH_GAME_SELECT,
  mapGameForSearchClient,
  deduplicateSeriesGames,
  buildVisibilityWhere,
  ROLE_LEVEL,
  roleToLevel,
  getRoleLevel,
  canManageGame,
  offerSpotToNextWaitlistUser,
  notifyOrganizerOfInstantJoin,
  notifyOrganizerOfPendingRequest,
  notifyOrganizerOfWaitlistJoin,
  broadcastGameUpdate,
  notifyRequesterOfDecision,
  sendAutoWelcomeMessage,
  createGame,
  searchGames,
  convertGameToSeries,
  patchGame,
  updateGame,
  deleteGame,
  getPublicGames,
  getMyGames,
  getMyHistory,
  getFriendsGames,
  getCityGames,
  getAllGames,
  getGamesByField,
  getGamesByDate,
  getTodayCityGames,
  getGameById,
  getGameRatings,
};
