const express = require('express');
const { publicDisplayName } = require('../utils/publicName');
const { authenticateToken } = require('../utils/auth');
const { safeUpsertUserFromAuth } = require('../utils/userSync');
const {
  prisma,
  notificationService,
  mapGameForClient,
  ROLE_LEVEL,
  getRoleLevel,
  canManageGame,
  offerSpotToNextWaitlistUser,
  notifyOrganizerOfInstantJoin,
  notifyOrganizerOfPendingRequest,
  notifyOrganizerOfWaitlistJoin,
  broadcastGameUpdate,
  notifyRequesterOfDecision,
  sendAutoWelcomeMessage,
} = require('../services/gameService');
const { notifyUserAddedToGame } = require('../utils/addedToGameNotification');
const { isBlockedEitherWay } = require('../utils/blocks');
const { getGameAccess, applyViewerAccess } = require('../utils/friendsOnlyAccess');
const { leaveUserChatRoom, leaveChatMemberships } = require('../utils/socketChatRooms');
const { isGameInsider, isGuestWindowClosed } = require('../utils/membersGuests');
const { lockGameRow } = require('../utils/gameRowLock');

const gameScheduler = require('../services/gameScheduler');
const notifCopy = require('../utils/notificationCopy');

const router = express.Router();

const REJOINABLE_STATUSES = ['REJECTED', 'NOT_SELECTED', 'CANCELLED'];

// Capacity check and the participation write, already inside the caller's transaction.
// lockGameRow is taken here even if the caller locked already: a second FOR UPDATE in the
// same transaction is a no-op, and every seat assignment must hold it.
async function assignSeatUnderLock(tx, gameId, userId) {
  const maxPlayers = await lockGameRow(tx, gameId);
  const current = await tx.participation.findFirst({
    where: { gameId, userId },
  });
  if (current && !REJOINABLE_STATUSES.includes(current.status)) return 'UNCHANGED';

  const allocatedSlotsCount = await tx.participation.count({
    where: {
      gameId,
      OR: [
        { status: 'CONFIRMED' },
        { status: 'PENDING', isWaitlistOffer: true },
      ],
    },
  });
  const status = allocatedSlotsCount >= maxPlayers ? 'WAITLISTED' : 'CONFIRMED';
  if (current) {
    await tx.participation.update({ where: { id: current.id }, data: { status } });
  } else {
    await tx.participation.create({
      data: { gameId, userId, status },
    });
  }
  return status;
}

// A cancelled game is frozen: no joins, leaves, approvals or roster edits. In particular /leave
// would otherwise promote the waitlist, or delete the game and its chat when the last player leaves.
async function rejectIfCancelled(req, res, next) {
  try {
    const game = await prisma.game.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (game && game.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Game was cancelled' });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const gameInclude = { participants: true, roles: true };
    let game = await prisma.game.findUnique({ where: { id: req.params.id }, include: gameInclude });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (game.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Game was cancelled' });
    }

    // The draw timer was missed (process down at lotteryAt): run the draw now. The draw holds
    // the same game-row lock as /join, so this request cannot take a seat until winners exist.
    // After it, the join falls through to the normal capacity/waitlist path below.
    if (game.lotteryEnabled && !game.lotteryExecutedAt && game.lotteryAt && new Date() >= new Date(game.lotteryAt)) {
      await gameScheduler.drawLottery(prisma, game.id);
      game = await prisma.game.findUnique({ where: { id: game.id }, include: gameInclude });
    }

    // Friends-only: outsiders can't join a BLOCKED-link game at all, and on a REQUEST_TO_JOIN
    // game their join always becomes a request the managers approve.
    const access = await getGameAccess(prisma, game, req.user.id, { isAdmin: !!req.user?.isAdmin });
    if (access === 'NONE') {
      return res.status(403).json({ error: 'This game is for friends only', code: 'GAME_FRIENDS_ONLY' });
    }
    const forceApproval = access === 'REQUEST';
    if (!game.isOpenToJoin) {
      return res.status(400).json({ error: 'Game is not open for joining' });
    }

    if (game.registrationOpensAt && new Date() < new Date(game.registrationOpensAt)) {
      return res.status(400).json({ error: 'Registration is not yet open' });
    }

    // Members-only priority: guests (non-members, the organizer's friends included) wait for the
    // later guest window. Someone already on the roster keeps their spot.
    if (game.membersOnlyPriority && isGuestWindowClosed(game)) {
      const onRoster = game.participants.some((p) => p.userId === req.user.id);
      if (!onRoster && !(await isGameInsider(prisma, game, req.user.id, { isAdmin: !!req.user?.isAdmin }))) {
        return res.status(400).json({
          error: 'Registration is not yet open for guests',
          code: 'GUEST_REGISTRATION_NOT_OPEN',
          guestRegistrationOpensAt: new Date(game.guestRegistrationOpensAt).toISOString(),
        });
      }
    }

    const existing = await prisma.participation.findFirst({
      where: { gameId: game.id, userId: req.user.id }
    });

    const finishJoinResponse = async (extra = {}) => {
      const updated = await prisma.game.findUnique({
        where: { id: game.id },
        include: { field: true, participants: { include: { user: true } } }
      });
      broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
      // Re-resolve access: a fresh PENDING request must not unlock the roster of a friends-only game.
      const viewerAccess = access === 'REQUEST' ? await getGameAccess(prisma, updated, req.user.id, { isAdmin: !!req.user?.isAdmin }) : 'FULL';
      return res.json({ ...applyViewerAccess(mapGameForClient(updated, req.user.id), viewerAccess), ...extra });
    };

    // Idempotent re-join: resync roster for the client without DB profile writes or duplicate notifications
    if (existing) {
      if (existing.status === 'CONFIRMED' || existing.status === 'WAITLISTED') {
        return finishJoinResponse();
      }
      if (existing.status === 'PENDING' && existing.isWaitlistOffer) {
        return res.status(400).json({ error: 'A spot is already offered to you' });
      }
      if (existing.status === 'PENDING') {
        return finishJoinResponse({ pending: true });
      }
      // REJECTED falls through — handled per join-policy below
    }

    // Approval-gated games (non-lottery only, for now): create a PENDING request instead of
    // an instant CONFIRMED participation. The organizer bypasses approval on their own game.
    // Friends-only outsiders (forceApproval) always go through here, lottery or not; approving
    // them puts them into the lottery draw (see /join-requests/:userId/approve).
    const needsApproval = forceApproval || (game.joinPolicy === 'REQUIRES_APPROVAL' && !game.lotteryEnabled);
    if (needsApproval && game.organizerId !== req.user.id) {
      if (existing?.status === 'REJECTED') {
        return res.status(400).json({ error: 'Your request to join this game was declined' });
      }
      if (game.lotteryEnabled && !game.lotteryExecutedAt) {
        if (!game.lotteryAt) {
          return res.status(400).json({ error: 'Lottery time is not set for this game' });
        }
      }

      await safeUpsertUserFromAuth(prisma, req.user);

      await prisma.participation.create({
        data: { gameId: game.id, userId: req.user.id, status: 'PENDING' }
      });
      notifyOrganizerOfPendingRequest(game, req.user, req.io);

      return finishJoinResponse({ pending: true });
    }

    // If lottery is enabled and hasn't executed yet, allow waitlist joins beyond capacity until lottery time.
    // `outcome` stays unset when this request is not a pre-draw pool join, so the capacity path below runs.
    let outcome;
    if (game.lotteryEnabled) {
      const cutoff = game.lotteryAt ? new Date(game.lotteryAt) : null;
      if (!game.lotteryExecutedAt) {
        if (!cutoff) {
          return res.status(400).json({ error: 'Lottery time is not set for this game' });
        }
        // Pre-draw: everyone joins the lottery pool (WAITLISTED); seats are only assigned by the draw.
        if (existing && existing.status !== 'REJECTED' && existing.status !== 'NOT_SELECTED' && existing.status !== 'CANCELLED') {
          return res.status(400).json({ error: 'You are already a participant' });
        }

        await safeUpsertUserFromAuth(prisma, req.user);
        outcome = await prisma.$transaction(async (tx) => {
          await lockGameRow(tx, game.id);
          const locked = await tx.game.findUnique({
            where: { id: game.id },
            select: { lotteryExecutedAt: true },
          });
          // This request read the game before the draw claimed it. Under the lock the draw has
          // already assigned seats, so a WAITLISTED insert would put them in a pool that will
          // never be drawn. Take a normal seat instead, still holding the lock.
          if (locked?.lotteryExecutedAt) {
            return assignSeatUnderLock(tx, game.id, req.user.id);
          }
          const current = await tx.participation.findFirst({ where: { gameId: game.id, userId: req.user.id } });
          if (current && !REJOINABLE_STATUSES.includes(current.status)) return 'UNCHANGED';
          if (current) {
            await tx.participation.update({ where: { id: current.id }, data: { status: 'WAITLISTED' } });
          } else {
            await tx.participation.create({ data: { gameId: game.id, userId: req.user.id, status: 'WAITLISTED' } });
          }
          return 'POOL';
        }, { timeout: 20000, maxWait: 10000 });
        if (outcome === 'POOL') {
          notifyOrganizerOfWaitlistJoin(game, req.user, req.io);

          // Add to Chat
          try {
            await prisma.chatParticipant.create({ data: { userId: req.user.id, chatId: game.id } });
          } catch (e) {
            // Ignore if chat room doesn't exist or already participant
          }

          return finishJoinResponse();
        }
      }
      // If lottery already ran, fall through to capacity check based on confirmed count
    }

    if (outcome === undefined) {
      await safeUpsertUserFromAuth(prisma, req.user);

      // The capacity check and the write must be one atomic step: without the game row lock, two
      // concurrent joiners both count the same free spot and both become CONFIRMED (overbooking).
      outcome = await prisma.$transaction(
        (tx) => assignSeatUnderLock(tx, game.id, req.user.id),
        { timeout: 20000, maxWait: 10000 },
      );
    }

    if (outcome === 'UNCHANGED') {
      return finishJoinResponse();
    }
    if (outcome === 'WAITLISTED') {
      notifyOrganizerOfWaitlistJoin(game, req.user, req.io);
      return finishJoinResponse();
    }

    notifyOrganizerOfInstantJoin(game, req.user, req.io);
    sendAutoWelcomeMessage(game, req.user.id);

    // Add to Chat
    try {
      await prisma.chatParticipant.create({ data: { userId: req.user.id, chatId: game.id } });
    } catch (e) {
      // Ignore
    }

    return finishJoinResponse();
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
    const [allRequests, rejectedList] = await Promise.all([
      prisma.participation.findMany({
        where: { gameId, status: { in: ['PENDING', 'WAITLISTED'] } },
        include: { user: true },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.participation.findMany({
        where: { gameId, status: 'REJECTED' },
        include: { user: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const toDTO = (p, idx) => ({
      userId: p.userId,
      name: publicDisplayName(p.user?.name, null),
      avatar: p.user?.imageUrl || null,
      requestedAt: p.createdAt.toISOString(),
      status: p.status,
      isWaitlistOffer: !!p.isWaitlistOffer,
      queuePosition: idx !== undefined ? idx + 1 : undefined
    });

    const pendingRequests = allRequests.filter(p => p.status === 'PENDING' && !p.isWaitlistOffer);
    const activeOfferUser = allRequests.find(p => p.status === 'PENDING' && p.isWaitlistOffer);
    const waitlistUsers = allRequests.filter(p => p.status === 'WAITLISTED');

    return res.json({
      requests: pendingRequests.map(p => toDTO(p)),
      activeOffer: activeOfferUser ? toDTO(activeOfferUser) : null,
      waitlist: waitlistUsers.map((p, idx) => toDTO(p, idx)),
      rejected: rejectedList.map(p => toDTO(p))
    });
  } catch (e) {
    console.error('List join requests error:', e);
    return res.status(500).json({ error: 'Failed to list join requests' });
  }
});

// Approve a pending join request (organizer/manager only)
router.post('/:id/join-requests/:userId/approve', authenticateToken, rejectIfCancelled, async (req, res) => {
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

    // While the lottery hasn't run, an approved request joins the draw (WAITLISTED is the
    // lottery pool, see gameScheduler._runLottery) instead of taking a seat directly.
    const lotteryPending = game.lotteryEnabled && !game.lotteryExecutedAt;
    // Same lock as /join, so an approval racing a join can't both take the last seat.
    const newStatus = await prisma.$transaction(async (tx) => {
      const maxPlayers = await lockGameRow(tx, gameId);
      const confirmedCount = await tx.participation.count({ where: { gameId, status: 'CONFIRMED' } });
      const s = !lotteryPending && confirmedCount < maxPlayers ? 'CONFIRMED' : 'WAITLISTED';
      await tx.participation.update({ where: { id: request.id }, data: { status: s } });
      return s;
    });

    try {
      await prisma.chatParticipant.create({ data: { userId: targetUserId, chatId: gameId } });
    } catch (e) {
      // Ignore if already a chat participant
    }

    notifyRequesterOfDecision(game, targetUserId, true, req.io, { enteredLottery: lotteryPending });
    if (newStatus === 'CONFIRMED') {
      sendAutoWelcomeMessage(game, targetUserId);
    }

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
router.post('/:id/join-requests/:userId/reject', authenticateToken, rejectIfCancelled, async (req, res) => {
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

// Bypass/skip a waitlist user with an active offer (organizer/manager only)
router.post('/:id/waitlist-bypass/:userId', authenticateToken, rejectIfCancelled, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;

    if (!(await canManageGame(gameId, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    // Ensure user has an active waitlist offer (PENDING and isWaitlistOffer === true)
    const participation = await prisma.participation.findFirst({
      where: { gameId, userId: targetUserId, status: 'PENDING', isWaitlistOffer: true }
    });

    if (!participation) {
      return res.status(400).json({ error: 'User does not have an active waitlist offer' });
    }

    // Evict them (delete participation)
    await prisma.participation.delete({
      where: { id: participation.id }
    });

    // Clean up chat participation
    try {
      await prisma.chatParticipant.deleteMany({
        where: { userId: targetUserId, chatId: gameId }
      });
      leaveUserChatRoom(req.io, targetUserId, gameId);
    } catch (e) {}

    // Notify user they were bypassed
    try {
      const game = await prisma.game.findUnique({ where: { id: gameId } });
      const c = notifCopy.gameRemovedPeer({ gameTitle: game?.title, bypassed: true });
      notificationService.sendNotification(
        targetUserId,
        'GAME_REMOVED_PEER',
        c.title,
        c.body,
        { gameId, actorId: req.user.id, ...notifCopy.enData(c) },
        req.io
      ).catch(err => console.error('[NOTIFICATIONS] Failed to notify bypassed user', gameId, err));
    } catch (e) {}

    // Auto-trigger next waitlist offer
    await offerSpotToNextWaitlistUser(gameId, req.io);

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));

    return res.json({ success: true, game: mapGameForClient(updated, req.user.id) });
  } catch (error) {
    console.error('Waitlist bypass error:', error);
    res.status(500).json({ error: 'Failed to bypass waitlist user' });
  }
});

// Next organizer when the current one leaves: a confirmed participant, managers first,
// earliest participation createdAt within that group. Pending, rejected, and waitlisted
// rows are not eligible.
async function pickOrganizerSuccessor(db, gameId, leavingUserId) {
  const confirmed = await db.participation.findMany({
    where: { gameId, status: 'CONFIRMED', userId: { not: leavingUserId } },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });
  if (!confirmed.length) return null;
  const managers = await db.gameRole.findMany({
    where: {
      gameId,
      role: 'MANAGER',
      userId: { in: confirmed.map((p) => p.userId) },
    },
    select: { userId: true },
  });
  const managerIds = new Set(managers.map((r) => r.userId));
  return confirmed.find((p) => managerIds.has(p.userId)) || confirmed[0];
}

// Leave game
router.post('/:id/leave', authenticateToken, rejectIfCancelled, async (req, res) => {
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
      const removedChatMembers = await prisma.chatParticipant.findMany({
        where: { chatId: gameId },
        select: { userId: true, chatId: true },
      });
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
        leaveChatMemberships(io, removedChatMembers);
      }
      return res.json({ message: 'Game deleted because the last player left', deleted: true });
    }

    const targetParticipation = participants.find(p => p.userId === req.user.id);
    const wasConfirmed = targetParticipation && targetParticipation.status === 'CONFIRMED';
    // Resolve access while the viewer's row still exists: a leaving outsider (pending/rejected
    // request) must not get the roster back in the response.
    const leaverAccess = await getGameAccess(prisma, { ...game, participants, roles: undefined }, req.user.id, { isAdmin: !!req.user?.isAdmin });

    const isOrganizer = game.organizerId === req.user.id;
    let successor = null;
    if (isOrganizer) {
      successor = await pickOrganizerSuccessor(prisma, game.id, req.user.id);
      if (!successor) {
        return res.status(400).json({
          error: 'לא ניתן לעזוב את המשחק כי אין משתתף מאושר שאפשר להעביר אליו את ניהול המשחק',
          code: 'NO_CONFIRMED_SUCCESSOR',
        });
      }
    }

    if (isOrganizer) {
      await prisma.$transaction(async (tx) => {
        await tx.participation.deleteMany({ where: { gameId: game.id, userId: req.user.id } });
        await tx.chatParticipant.deleteMany({ where: { userId: req.user.id, chatId: game.id } });
        await tx.game.update({ where: { id: game.id }, data: { organizerId: successor.userId } });
        await tx.gameRole.deleteMany({ where: { gameId: game.id, userId: req.user.id } });
        await tx.gameRole.upsert({
          where: { gameId_userId: { gameId: game.id, userId: successor.userId } },
          update: { role: 'ORGANIZER' },
          create: { gameId: game.id, userId: successor.userId, role: 'ORGANIZER' },
        });
      });
    } else {
      await prisma.participation.deleteMany({ where: { gameId: game.id, userId: req.user.id } });
      try {
        await prisma.chatParticipant.deleteMany({ where: { userId: req.user.id, chatId: game.id } });
      } catch (e) { /* Ignore */ }
    }
    try { leaveUserChatRoom(req.io, req.user.id, game.id); } catch (e) { /* Ignore */ }

    // If a confirmed player left, offer the spot to the next waitlisted user
    if (wasConfirmed) {
      await offerSpotToNextWaitlistUser(game.id, req.io);
    }

    const updated = await prisma.game.findUnique({
      where: { id: game.id },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
    res.json(applyViewerAccess(mapGameForClient(updated, req.user.id), leaverAccess));
  } catch (error) {
    console.error('Leave game error:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

router.post('/:id/waitlist-confirm', authenticateToken, rejectIfCancelled, async (req, res) => {
  try {
    const { accept } = req.body;
    const game = await prisma.game.findUnique({
      where: { id: req.params.id },
      include: { field: true }
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const participation = await prisma.participation.findFirst({
      where: { gameId: game.id, userId: req.user.id }
    });

    if (!participation || participation.status !== 'PENDING' || !participation.isWaitlistOffer) {
      return res.status(400).json({ error: 'No pending waitlist offer found for you on this game' });
    }

    if (accept) {
      await prisma.participation.update({
        where: { id: participation.id },
        data: { status: 'CONFIRMED', isWaitlistOffer: false }
      });

      try {
        await prisma.chatParticipant.create({ data: { userId: req.user.id, chatId: game.id } });
      } catch (e) { /* Ignore */ }
      
      sendAutoWelcomeMessage(game, req.user.id);
    } else {
      await prisma.participation.delete({
        where: { id: participation.id }
      });

      await offerSpotToNextWaitlistUser(game.id, req.io);
    }

    const updated = await prisma.game.findUnique({
      where: { id: game.id },
      include: {
        field: true,
        participants: { include: { user: true } },
        roles: { include: { user: true } },
        teams: true,
      }
    });
    // Await so recipients (and this client's lists) get CONFIRMED / leave before the HTTP response returns.
    await broadcastGameUpdate(req.io, game.id, updated);
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Waitlist confirm error:', error);
    res.status(500).json({ error: 'Failed to process waitlist confirmation' });
  }
});

router.post('/:id/participants', authenticateToken, rejectIfCancelled, async (req, res) => {
  try {
    const gameId = req.params.id;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!(await canManageGame(gameId, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Ensure user exists in local User table
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists || userExists.deletedAt) {
      return res.status(404).json({ error: 'User not found in local database' });
    }
    if (await isBlockedEitherWay(req.user.id, userId)) {
      return res.status(403).json({ error: 'Cannot add this user', code: 'USER_BLOCKED' });
    }

    const already = await prisma.participation.findFirst({
      where: { gameId, userId }
    });

    if (already) {
      if (already.status === 'CONFIRMED') {
        return res.status(400).json({ error: 'User is already a confirmed participant' });
      }
      await prisma.participation.update({
        where: { id: already.id },
        data: { status: 'CONFIRMED', isWaitlistOffer: false }
      });
    } else {
      await prisma.participation.create({
        data: {
          gameId,
          userId,
          status: 'CONFIRMED'
        }
      });
    }

    // Add to ChatRoom
    try {
      await prisma.chatParticipant.upsert({
        where: { userId_chatId: { userId, chatId: gameId } },
        update: {},
        create: { userId, chatId: gameId }
      });
    } catch (e) {
      // Ignore
    }

    sendAutoWelcomeMessage(game, userId);

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));

    // Immediate in-app + push for the friend who was manually added (not a self-join).
    notifyUserAddedToGame(notificationService, {
      userId,
      adderName: req.user?.name,
      adderId: req.user?.id,
      game: updated || { ...game, id: gameId },
      io: req.io,
    });

    return res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// Remove participant from game (organizer/manager only)
router.delete('/:id/participants/:userId', authenticateToken, rejectIfCancelled, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;

    if (!(await canManageGame(gameId, req.user.id))) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.organizerId === targetUserId) {
      return res.status(400).json({ error: 'Cannot remove the game organizer' });
    }

    // Check hierarchy: can only remove users strictly below you
    const actorLevel = await getRoleLevel(gameId, req.user.id);
    const targetLevel = await getRoleLevel(gameId, targetUserId);
    if (targetLevel >= actorLevel) {
      return res.status(403).json({ error: 'Cannot remove a participant with peer or higher role' });
    }

    const participation = await prisma.participation.findFirst({
      where: { gameId, userId: targetUserId }
    });
    if (!participation) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const wasConfirmed = participation.status === 'CONFIRMED';

    // Delete participation
    await prisma.participation.delete({
      where: { id: participation.id }
    });

    // Clean up manager role if any
    await prisma.gameRole.deleteMany({
      where: { gameId, userId: targetUserId }
    });

    // Remove from ChatRoom
    try {
      await prisma.chatParticipant.deleteMany({
        where: { userId: targetUserId, chatId: gameId }
      });
      leaveUserChatRoom(req.io, targetUserId, gameId);
    } catch (e) {
      // Ignore
    }

    // Send a notification to the removed user
    try {
      const c = notifCopy.gameRemovedPeer({ gameTitle: game.title });
      notificationService.sendNotification(
        targetUserId,
        'GAME_REMOVED_PEER',
        c.title,
        c.body,
        { gameId, actorId: req.user.id, ...notifCopy.enData(c) },
        req.io
      ).catch(err => console.error('[NOTIFICATIONS] Failed to notify user of removal', gameId, err));
    } catch (err) {
      console.error('[NOTIFICATIONS] Fatal validation exception in sendNotification call', gameId, err);
    }

    // Offer spot to next waitlisted user if a confirmed player was removed
    if (wasConfirmed) {
      await offerSpotToNextWaitlistUser(gameId, req.io);
    }

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

// Toggle participant's captain role
router.patch('/:id/participants/:userId/captain', authenticateToken, rejectIfCancelled, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;
    const { isCaptain } = req.body;

    const actorLevel = await getRoleLevel(gameId, req.user.id);
    if (actorLevel < ROLE_LEVEL.MODERATOR) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Captain is a purely descriptive flag with no game-management privileges of its own, so it
    // deliberately doesn't go through the organizer-immunity / role-hierarchy checks that gate
    // actual management roles (see the roster-removal endpoint above) — the organizer or a peer
    // manager can freely be made captain, including of themselves.

    // Ensure target is an active participant
    const isParticipant = await prisma.participation.findFirst({
      where: { gameId, userId: targetUserId, status: 'CONFIRMED' }
    });
    if (!isParticipant) {
      return res.status(400).json({ error: 'Target user is not a participant' });
    }

    // Elevate / Revoke
    await prisma.participation.update({
      where: { id: isParticipant.id },
      data: { isCaptain: Boolean(isCaptain) }
    });

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Set captain error:', error);
    res.status(500).json({ error: 'Failed to set participant as captain' });
  }
});

module.exports = router;
