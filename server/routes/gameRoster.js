const express = require('express');
const { authenticateToken } = require('../utils/auth');
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
} = require('../services/gameService');

const router = express.Router();

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
        if (status === 'WAITLISTED') {
          notifyOrganizerOfWaitlistJoin(game, req.user, req.io);
        } else {
          notifyOrganizerOfInstantJoin(game, req.user, req.io);
        }

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

    const allocatedSlotsCount = await prisma.participation.count({
      where: {
        gameId: game.id,
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', isWaitlistOffer: true }
        ]
      }
    });
    if (allocatedSlotsCount >= game.maxPlayers) {
      const already = await prisma.participation.findFirst({ where: { gameId: game.id, userId: req.user.id } });
      if (already) {
        if (already.status === 'WAITLISTED') {
          return res.status(400).json({ error: 'You are already on the waitlist' });
        }
        if (already.status === 'CONFIRMED') {
          return res.status(400).json({ error: 'You are already a confirmed participant' });
        }
        if (already.status === 'PENDING') {
          return res.status(400).json({ error: 'A spot is already offered to you' });
        }
        await prisma.participation.update({ where: { id: already.id }, data: { status: 'WAITLISTED' } });
        notifyOrganizerOfWaitlistJoin(game, req.user, req.io);
      } else {
        await prisma.user.upsert({
          where: { id: req.user.id },
          update: { name: req.user.name, imageUrl: req.user.avatar },
          create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar, email: undefined }
        });
        await prisma.participation.create({
          data: { gameId: game.id, userId: req.user.id, status: 'WAITLISTED' }
        });
        notifyOrganizerOfWaitlistJoin(game, req.user, req.io);
      }

      const updated = await prisma.game.findUnique({
        where: { id: game.id },
        include: { field: true, participants: { include: { user: true } } }
      });
      broadcastGameUpdate(req.io, game.id, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', game.id, err));
      return res.json(mapGameForClient(updated, req.user.id));
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
      name: p.user?.name || null,
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

// Bypass/skip a waitlist user with an active offer (organizer/manager only)
router.post('/:id/waitlist-bypass/:userId', authenticateToken, async (req, res) => {
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
    } catch (e) {}

    // Notify user they were bypassed
    try {
      const game = await prisma.game.findUnique({ where: { id: gameId } });
      notificationService.sendNotification(
        targetUserId,
        'GAME_REMOVED_PEER',
        'בוטל מועד ההצטרפות שלך',
        `מנהל המשחק ביטל את הצעת ההצטרפות שלך למשחק: ${game?.title || 'משחק כדורגל'}`,
        { gameId },
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

    const targetParticipation = participants.find(p => p.userId === req.user.id);
    const wasConfirmed = targetParticipation && targetParticipation.status === 'CONFIRMED';

    // Normal leave logic
    await prisma.participation.deleteMany({ where: { gameId: game.id, userId: req.user.id } });

    // Remove from Chat
    try {
      await prisma.chatParticipant.deleteMany({ where: { userId: req.user.id, chatId: game.id } });
    } catch (e) { /* Ignore */ }

    // If a confirmed player left, offer the spot to the next waitlisted user
    if (wasConfirmed) {
      await offerSpotToNextWaitlistUser(game.id, req.io);
    }

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

router.post('/:id/waitlist-confirm', authenticateToken, async (req, res) => {
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

router.post('/:id/participants', authenticateToken, async (req, res) => {
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
    if (!userExists) {
      return res.status(404).json({ error: 'User not found in local database' });
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

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
    try {
      notificationService.sendNotification(
        userId,
        'GAME_INVITATION',
        'צורפת למשחק!',
        `מנהל המשחק הוסיף אותך למשחק: ${game.title || 'משחק כדורגל'}`,
        { gameId, link: `/game/${gameId}` },
        req.io
      ).catch(err => console.error('[NOTIFICATIONS] Failed to notify user of addition', gameId, err));
    } catch (err) {
      console.error('[NOTIFICATIONS] Fatal validation exception in sendNotification call', gameId, err);
    }
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// Remove participant from game (organizer/manager only)
router.delete('/:id/participants/:userId', authenticateToken, async (req, res) => {
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
    } catch (e) {
      // Ignore
    }

    // Send a notification to the removed user
    try {
      notificationService.sendNotification(
        targetUserId,
        'GAME_REMOVED_PEER',
        'הוסרת מהמשחק',
        `מנהל המשחק הסיר אותך מהמשחק: ${game.title || 'משחק כדורגל'}`,
        { gameId },
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

// Toggle participant's manager role (organizer/manager only)
router.post('/:id/participants/:userId/toggle-role', authenticateToken, async (req, res) => {
  try {
    const gameId = req.params.id;
    const targetUserId = req.params.userId;

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

    if (game.organizerId === targetUserId) {
      return res.status(400).json({ error: 'Cannot modify organizer role' });
    }

    // Ensure target is a participant
    const isParticipant = await prisma.participation.findFirst({
      where: { gameId, userId: targetUserId }
    });
    if (!isParticipant) {
      return res.status(400).json({ error: 'Target user is not a participant' });
    }

    // Hierarchy check: can only affect users strictly below you
    const targetLevel = await getRoleLevel(gameId, targetUserId);
    if (targetLevel >= actorLevel) {
      return res.status(403).json({ error: 'Cannot modify a peer or higher role' });
    }

    const existingRole = await prisma.gameRole.findUnique({
      where: { gameId_userId: { gameId, userId: targetUserId } }
    });

    let newRole = null;
    if (existingRole && existingRole.role === 'MANAGER') {
      // Revoke
      await prisma.gameRole.delete({
        where: { id: existingRole.id }
      });
      newRole = 'PLAYER';
    } else {
      // Elevate
      await prisma.gameRole.upsert({
        where: { gameId_userId: { gameId, userId: targetUserId } },
        create: { gameId, userId: targetUserId, role: 'MANAGER' },
        update: { role: 'MANAGER' }
      });
      newRole = 'MANAGER';
    }

    // Notify user
    const title = newRole === 'MANAGER' ? 'הועלית למנהל משחק!' : 'הוסרו הרשאות הניהול שלך';
    const body = newRole === 'MANAGER' 
      ? `מנהל המשחק העלה אותך לדרגת מנהל במשחק: ${game.title || 'משחק כדורגל'}`
      : `הוסרו הרשאות הניהול שלך במשחק: ${game.title || 'משחק כדורגל'}`;

    try {
      notificationService.sendNotification(
        targetUserId,
        'GAME_ROLE_UPDATE',
        title,
        body,
        { gameId, newRole },
        req.io
      ).catch(err => console.error('[NOTIFICATIONS] Failed to notify user of role update', gameId, err));
    } catch (err) {
      console.error('[NOTIFICATIONS] Fatal validation exception in sendNotification call', gameId, err);
    }

    const updated = await prisma.game.findUnique({
      where: { id: gameId },
      include: { field: true, participants: { include: { user: true } } }
    });
    broadcastGameUpdate(req.io, gameId, updated).catch(err => console.error('[SOCKET] Failed to broadcast game update', gameId, err));
    return res.json(mapGameForClient(updated, req.user.id));
  } catch (error) {
    console.error('Toggle role error:', error);
    res.status(500).json({ error: 'Failed to toggle participant role' });
  }
});

module.exports = router;
