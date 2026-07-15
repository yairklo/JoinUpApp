const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const { NotificationService } = require('../services/notificationService');
const { getCounters, broadcastCounters } = require('../services/counterService');
const {
  VALID_LEVELS,
  resolvePrivacyLevel,
  areConfirmedFriends,
  canViewSection,
} = require('../utils/privacy');
const {
  isGameRatingEligible,
  isConfirmedParticipant,
  getUserRatingSummary,
  validateScore,
} = require('../utils/ratings');
const router = express.Router();
const prisma = new PrismaClient();
const notificationService = new NotificationService(prisma);

// Shared constants
const { SPORT_KEYS } = require('../utils/sports');

// Helper to ensure sports exist
async function ensureSportsSeeded() {
  const count = await prisma.sport.count();
  if (count === 0) {
    console.log('Seeding initial sports...');
    for (const name of SPORT_KEYS) {
      await prisma.sport.create({ data: { id: name, name } });
    }
  }
}

// Get all available sports (and seed if missing)
router.get('/sports', async (req, res) => {
  try {
    await ensureSportsSeeded();
    const sports = await prisma.sport.findMany();
    res.json(sports);
  } catch (e) {
    console.error('Get sports error:', e);
    res.status(500).json({ error: 'Failed to fetch sports' });
  }
});

// Search users/players
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const loggedInUserId = req.user.id;
    console.log(`[Backend User Search] 🔍 Query: "${q}", Logged-in user: "${loggedInUserId}"`);

    if (!q) {
      console.log('[Backend User Search] ⚠️ Empty query string. Returning early.');
      return res.json([]);
    }

    // Fetch matching users
    const matchingUsers = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: loggedInUserId } },
          {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } }
            ]
          },
          {
            OR: [
              { email: null },
              { NOT: { email: { contains: '@mock.joinup.com' } } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true,
        city: true
      },
      take: 50
    });

    // Fetch friendships and friend requests to determine status in O(1)
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: loggedInUserId }, { userBId: loggedInUserId }] }
    });
    const friendRequests = await prisma.friendRequest.findMany({
      where: { OR: [{ requesterId: loggedInUserId }, { receiverId: loggedInUserId }] }
    });

    const friendIds = new Set(friendships.map(f => (f.userAId === loggedInUserId ? f.userBId : f.userAId)));
    const pendingRequesterIds = new Set(friendRequests.filter(r => r.status === 'PENDING').map(r => (r.requesterId === loggedInUserId ? r.receiverId : r.requesterId)));

    const requestMap = {};
    friendRequests.forEach(r => {
      if (r.status === 'PENDING') {
        const otherId = r.requesterId === loggedInUserId ? r.receiverId : r.requesterId;
        requestMap[otherId] = {
          id: r.id,
          senderId: r.requesterId
        };
      }
    });

    const results = matchingUsers.map(u => {
      let friendshipStatus = 'none';
      let requestId = null;
      let isRequestSender = false;

      if (friendIds.has(u.id)) {
        friendshipStatus = 'friends';
      } else if (pendingRequesterIds.has(u.id)) {
        friendshipStatus = 'pending';
        requestId = requestMap[u.id]?.id || null;
        isRequestSender = requestMap[u.id]?.senderId === loggedInUserId;
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        imageUrl: u.imageUrl,
        city: u.city,
        friendshipStatus,
        requestId,
        isRequestSender
      };
    });
    console.log(`[Backend User Search] ✅ Found ${results.length} matching users. Returning results.`);
    res.json(results);
  } catch (error) {
    console.error('[Backend User Search] ❌ Error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// GET /api/users/notifications/counts - Aggregated Navbar/Tab badge counters
// (pending friend requests awaiting the caller's decision + unread chat *rooms*
// across all rooms the caller belongs to). Kept as a static route, registered
// before any '/:id'-style routes below to avoid path collisions.
router.get('/notifications/counts', authenticateToken, async (req, res) => {
  try {
    const counters = await getCounters(prisma, req.user.id);
    res.json(counters);
  } catch (e) {
    console.error('Get notification counters error:', e);
    res.status(500).json({ error: 'Failed to fetch notification counters' });
  }
});

// PUT /api/users/profile/settings - update the caller's privacy flags.
// Static path registered before '/:id' routes to avoid param capture.
router.put('/profile/settings', authenticateToken, async (req, res) => {
  try {
    const { privacyFriends, privacyGames, privacyMessages } = req.body || {};

    const validate = (v, field) => {
      if (typeof v === 'undefined') return undefined;
      if (v === null) return null;
      if (VALID_LEVELS.includes(v)) return v;
      throw new Error(`Invalid value for ${field}`);
    };

    let data;
    try {
      data = {
        ...(typeof privacyFriends !== 'undefined' ? { privacyFriends: validate(privacyFriends, 'privacyFriends') } : {}),
        ...(typeof privacyGames !== 'undefined' ? { privacyGames: validate(privacyGames, 'privacyGames') } : {}),
        ...(typeof privacyMessages !== 'undefined' ? { privacyMessages: validate(privacyMessages, 'privacyMessages') } : {}),
      };
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        birthDate: true,
        privacyFriends: true,
        privacyGames: true,
        privacyMessages: true,
      },
    });

    res.json({
      privacyFriends: updated.privacyFriends,
      privacyGames: updated.privacyGames,
      privacyMessages: updated.privacyMessages,
      resolved: {
        privacyFriends: resolvePrivacyLevel(updated.privacyFriends, updated.birthDate),
        privacyGames: resolvePrivacyLevel(updated.privacyGames, updated.birthDate),
        privacyMessages: resolvePrivacyLevel(updated.privacyMessages, updated.birthDate),
      },
    });
  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// List users (public basic listing)
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(users.map(u => ({ id: u.id, name: u.name, imageUrl: u.imageUrl, city: u.city })));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Favorites API
router.get('/:id/favorites', async (req, res) => {
  try {
    const rows = await prisma.favoriteField.findMany({ where: { userId: req.params.id }, include: { field: true } });
    res.json(rows.map(r => r.field));
  } catch (e) {
    console.error('Get favorites error:', e);
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

router.post('/:id/favorites/:fieldId', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const row = await prisma.favoriteField.upsert({
      where: { userId_fieldId: { userId: req.user.id, fieldId: req.params.fieldId } },
      update: {},
      create: { userId: req.user.id, fieldId: req.params.fieldId }
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('Add favorite error:', e);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/:id/favorites/:fieldId', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    await prisma.favoriteField.delete({ where: { userId_fieldId: { userId: req.user.id, fieldId: req.params.fieldId } } });
    res.json({ ok: true });
  } catch (e) {
    console.error('Remove favorite error:', e);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});


function mapUserPublic(u) {
  if (!u) return u;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    imageUrl: u.imageUrl,
    city: u.city,
    birthDate: u.birthDate,
    age: u.birthDate ? (() => {
      const diff = Date.now() - new Date(u.birthDate).getTime();
      const ageDt = new Date(diff);
      return Math.abs(ageDt.getUTCFullYear() - 1970);
    })() : null,
    sports: (u.sports || []).map(us => ({
      id: us.sport.id,
      name: us.sport.name,
      position: us.positionDescription
    })),
    positions: (u.positions || []).map(up => ({ id: up.position.id, name: up.position.name, sportId: up.position.sportId }))
  };
}

async function getFriendIds(userId) {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true }
  });
  return friendships.map(f => (f.userAId === userId ? f.userBId : f.userAId));
}

function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// POST /api/users/:id/rate — submit a one-shot 1–5 star rating for a teammate in a finished game.
router.post('/:id/rate', authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const raterId = req.user.id;
    const { gameId, score } = req.body || {};

    if (!gameId) {
      return res.status(400).json({ error: 'gameId is required' });
    }
    if (!validateScore(score)) {
      return res.status(400).json({ error: 'score must be an integer between 1 and 5' });
    }
    if (raterId === targetId) {
      return res.status(400).json({ error: 'Cannot rate yourself' });
    }

    const game = await prisma.game.findUnique({
      where: { id: String(gameId) },
      select: { id: true, start: true, status: true },
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (!isGameRatingEligible(game)) {
      return res.status(400).json({ error: 'Game is not finished yet' });
    }

    const [raterOk, targetOk] = await Promise.all([
      isConfirmedParticipant(gameId, raterId),
      isConfirmedParticipant(gameId, targetId),
    ]);
    if (!raterOk || !targetOk) {
      return res.status(403).json({ error: 'Both users must be confirmed participants in this game' });
    }

    try {
      await prisma.userRating.create({
        data: {
          gameId: String(gameId),
          raterId,
          targetId,
          score,
        },
      });
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(409).json({ error: 'Already rated this player for this game' });
      }
      throw e;
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// Public user profile (safe fields) with privacy-aware Friends / Match History sections.
router.get('/:id', attachOptionalUser, async (req, res) => {
  try {
    const targetId = req.params.id;
    let user = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        sports: { include: { sport: true } },
        positions: { include: { position: true } }
      }
    });
    if (!user) {
      // create a minimal placeholder so users appear in listings
      await prisma.user.create({ data: { id: targetId } });
      user = await prisma.user.findUnique({
        where: { id: targetId },
        include: { sports: { include: { sport: true } }, positions: { include: { position: true } } }
      });
    }

    const viewerId = req.user?.id || null;
    const isOwner = viewerId === targetId;
    const isFriend = viewerId && !isOwner ? await areConfirmedFriends(viewerId, targetId) : false;

    const effFriends = resolvePrivacyLevel(user.privacyFriends, user.birthDate);
    const effGames = resolvePrivacyLevel(user.privacyGames, user.birthDate);

    const showFriends = canViewSection({ effectivePrivacy: effFriends, isOwner, isFriend });
    const showGames = canViewSection({ effectivePrivacy: effGames, isOwner, isFriend });

    const ratingSummary = await getUserRatingSummary(targetId);

    const payload = {
      ...mapUserPublic(user),
      ratingAverage: ratingSummary.ratingAverage,
      totalRatings: ratingSummary.totalRatings,
      sections: { friends: showFriends, matchHistory: showGames },
      friends: null,
      matchHistory: null,
      sportStats: [],
    };

    // Friends list (id/name/imageUrl only) when visible.
    if (showFriends) {
      const friendIds = await getFriendIds(targetId);
      payload.friends = friendIds.length
        ? await prisma.user.findMany({
            where: { id: { in: friendIds } },
            select: { id: true, name: true, imageUrl: true },
            take: 20,
          })
        : [];
    }

    // Match history + per-sport aggregation when visible.
    if (showGames) {
      const now = new Date();
      const [participations, grouped] = await Promise.all([
        prisma.participation.findMany({
          where: { userId: targetId, status: 'CONFIRMED', game: { start: { lt: now } } },
          select: { game: { select: { id: true, title: true, sport: true, start: true } } },
          orderBy: { game: { start: 'desc' } },
          take: 5,
        }),
        // Count all past CONFIRMED matches grouped by sport.
        prisma.game.groupBy({
          by: ['sport'],
          where: {
            start: { lt: now },
            participants: { some: { userId: targetId, status: 'CONFIRMED' } },
          },
          _count: { _all: true },
        }),
      ]);

      payload.matchHistory = participations.map((p) => p.game);
      payload.sportStats = grouped.map((g) => ({ sport: g.sport, count: g._count._all }));
    }

    // Owner also receives their raw + resolved privacy settings for the settings UI.
    if (isOwner) {
      payload.privacySettings = {
        privacyFriends: user.privacyFriends,
        privacyGames: user.privacyGames,
        privacyMessages: user.privacyMessages,
        resolved: {
          privacyFriends: effFriends,
          privacyGames: effGames,
          privacyMessages: resolvePrivacyLevel(user.privacyMessages, user.birthDate),
        },
      };
    }

    res.json(payload);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Paginated match history (privacy-enforced). Used by the profile "Load More" button.
router.get('/:id/match-history', attachOptionalUser, async (req, res) => {
  try {
    const targetId = req.params.id;
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const take = Math.min(20, Math.max(1, parseInt(req.query.take, 10) || 5));

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { birthDate: true, privacyGames: true },
    });
    if (!user) return res.json([]);

    const viewerId = req.user?.id || null;
    const isOwner = viewerId === targetId;
    const isFriend = viewerId && !isOwner ? await areConfirmedFriends(viewerId, targetId) : false;
    const effGames = resolvePrivacyLevel(user.privacyGames, user.birthDate);

    if (!canViewSection({ effectivePrivacy: effGames, isOwner, isFriend })) {
      return res.status(403).json({ error: 'This section is private' });
    }

    const participations = await prisma.participation.findMany({
      where: { userId: targetId, status: 'CONFIRMED', game: { start: { lt: new Date() } } },
      select: { game: { select: { id: true, title: true, sport: true, start: true } } },
      orderBy: { game: { start: 'desc' } },
      skip,
      take,
    });

    res.json(participations.map((p) => p.game));
  } catch (error) {
    console.error('Match history pagination error:', error);
    res.status(500).json({ error: 'Failed to load match history' });
  }
});

// Update user profile (owner only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, email, phone, imageUrl, city, birthDate, sportIds, sportsData, positionIds } = req.body;
    const data = {
      ...(typeof name !== 'undefined' ? { name } : {}),
      ...(typeof email !== 'undefined' ? { email } : {}),
      ...(typeof phone !== 'undefined' ? { phone } : {}),
      ...(typeof imageUrl !== 'undefined' ? { imageUrl } : {}),
      ...(typeof city !== 'undefined' ? { city } : {}),
      ...(typeof birthDate !== 'undefined' ? { birthDate: birthDate ? new Date(birthDate) : null } : {}),
    };

    const updated = await prisma.user.update({ where: { id: req.user.id }, data });

    // Update sports with positions
    if (Array.isArray(sportsData)) {
      await ensureSportsSeeded();
      await prisma.userSport.deleteMany({ where: { userId: req.user.id } });
      if (sportsData.length > 0) {
        await prisma.userSport.createMany({
          data: sportsData.map((s) => ({
            userId: req.user.id,
            sportId: String(s.sportId),
            positionDescription: s.position || null
          }))
        });
      }
    } else if (Array.isArray(sportIds)) {
      // Legacy support or simple list
      await prisma.userSport.deleteMany({ where: { userId: req.user.id } });
      await prisma.userSport.createMany({ data: sportIds.map((sid) => ({ userId: req.user.id, sportId: String(sid) })) });
    }

    // Optional: replace positions
    if (Array.isArray(positionIds)) {
      await prisma.userPosition.deleteMany({ where: { userId: req.user.id } });
      await prisma.userPosition.createMany({ data: positionIds.map((pid) => ({ userId: req.user.id, positionId: String(pid) })) });
    }

    const full = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { sports: { include: { sport: true } }, positions: { include: { position: true } } }
    });
    res.json(mapUserPublic(full));
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// List friends for a user (public basic info)
router.get('/:id/friends', async (req, res) => {
  try {
    const friendIds = await getFriendIds(req.params.id);
    if (friendIds.length === 0) return res.json([]);
    const friends = await prisma.user.findMany({ where: { id: { in: friendIds } } });
    // mutual friends relative to current viewer (if signed in)
    let viewerMutual = new Set();
    if (req.auth?.userId) {
      const ids = await getFriendIds(req.auth.userId);
      viewerMutual = new Set(ids);
    }
    const mapped = friends.map(u => ({
      ...mapUserPublic(u),
      mutualCount: Array.from(viewerMutual).includes(u.id) ? 1 : 0 // simple approx
    }));
    res.json(mapped);
  } catch (e) {
    console.error('List friends error:', e);
    res.status(500).json({ error: 'Failed to list friends' });
  }
});

// Send friend request
router.post('/requests', authenticateToken, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { receiverId } = req.body;
    if (!receiverId || receiverId === requesterId) return res.status(400).json({ error: 'Invalid receiver' });
    // Ensure both users exist in our DB (upsert current, create receiver if missing)
    await prisma.user.upsert({
      where: { id: requesterId },
      update: { name: req.user.name || undefined, imageUrl: req.user.avatar || undefined },
      create: { id: requesterId, name: req.user.name || null, imageUrl: req.user.avatar || null }
    });
    const rx = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!rx) {
      await prisma.user.create({ data: { id: receiverId } });
    }
    // already friends?
    const [a, b] = orderPair(requesterId, receiverId);
    const existingFriend = await prisma.friendship.findFirst({ where: { OR: [{ userAId: a, userBId: b }, { userAId: b, userBId: a }] } });
    if (existingFriend) return res.status(400).json({ error: 'Already friends' });
    // existing request either way
    const existingReq = await prisma.friendRequest.findFirst({ where: { OR: [{ requesterId, receiverId }, { requesterId: receiverId, receiverId: requesterId }] } });
    if (existingReq) return res.status(400).json({ error: 'Request already exists' });
    try {
      const fr = await prisma.friendRequest.create({ data: { requesterId, receiverId } });

      // Send notification to receiver
      const requester = await prisma.user.findUnique({ where: { id: requesterId } });
      await notificationService.sendNotification(
        receiverId,
        'FRIEND_REQUEST',
        'בקשת חברות חדשה',
        `${requester?.name || 'משתמש'} שלח/ה לך בקשת חברות`,
        {
          friendRequestId: fr.id,
          requesterId,
          requesterName: requester?.name,
          link: '/friends'
        },
        req.app.get('io') // Get Socket.IO instance from app
      ).catch(err => console.error('[NOTIFICATION] Failed to send friend request notification:', err));

      broadcastCounters(req.app.get('io'), prisma, receiverId).catch(() => {});

      res.status(201).json(fr);
    } catch (err) {
      // handle unique race condition
      return res.status(400).json({ error: 'Request already exists' });
    }
  } catch (e) {
    console.error('Send request error:', e);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// Incoming requests for current user
router.get('/:id/requests/incoming', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const list = await prisma.friendRequest.findMany({ where: { receiverId: req.user.id, status: 'PENDING' }, include: { requester: true } });
    res.json(list.map(r => ({ id: r.id, requester: mapUserPublic(r.requester), createdAt: r.createdAt })));
  } catch (e) {
    console.error('Incoming requests error:', e);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Outgoing requests for current user
router.get('/:id/requests/outgoing', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const list = await prisma.friendRequest.findMany({ where: { requesterId: req.user.id, status: 'PENDING' }, include: { receiver: true } });
    res.json(list.map(r => ({ id: r.id, receiver: mapUserPublic(r.receiver), createdAt: r.createdAt })));
  } catch (e) {
    console.error('Outgoing requests error:', e);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Accept request
router.post('/requests/:id/accept', authenticateToken, async (req, res) => {
  try {
    const reqRow = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow || reqRow.receiverId !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    const [a, b] = orderPair(reqRow.requesterId, reqRow.receiverId);
    await prisma.$transaction([
      prisma.friendRequest.delete({ where: { id: reqRow.id } }),
      prisma.friendship.create({ data: { userAId: a, userBId: b } })
    ]);

    // Send notification to requester
    const accepter = await prisma.user.findUnique({ where: { id: req.user.id } });
    await notificationService.sendNotification(
      reqRow.requesterId,
      'FRIEND_ACCEPTED',
      'בקשת חברות אושרה',
      `${accepter?.name || 'משתמש'} אישר/ה את בקשת החברות שלך`,
      {
        userId: req.user.id,
        userName: accepter?.name,
        link: `/profile/${req.user.id}`
      },
      req.app.get('io')
    ).catch(err => console.error('[NOTIFICATION] Failed to send friend accepted notification:', err));

    // The accepter's pending-request badge count just dropped by one.
    broadcastCounters(req.app.get('io'), prisma, req.user.id).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    console.error('Accept request error:', e);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// Decline request
router.post('/requests/:id/decline', authenticateToken, async (req, res) => {
  try {
    const reqRow = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow || reqRow.receiverId !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    await prisma.friendRequest.update({ where: { id: reqRow.id }, data: { status: 'DECLINED' } });

    // The decliner's pending-request badge count just dropped by one.
    broadcastCounters(req.app.get('io'), prisma, req.user.id).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    console.error('Decline request error:', e);
    res.status(500).json({ error: 'Failed to decline request' });
  }
});

// Remove friend
router.delete('/:id/friends/:friendId', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const [a, b] = orderPair(req.user.id, req.params.friendId);
    await prisma.friendship.delete({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    res.json({ ok: true });
  } catch (e) {
    console.error('Remove friend error:', e);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// List all chats for a user (Groups + Private, Relational)
router.get('/:id/chats', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Fetch all chat participations for the user
    const participations = await prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            participants: {
              include: { user: true }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    // Pre-fetch Games for Group Chats
    const groupChatIds = participations
      .filter(p => p.chat.type.toUpperCase() === 'GROUP')
      .map(p => p.chatId);

    const gameMap = {};
    if (groupChatIds.length > 0) {
      const games = await prisma.game.findMany({
        where: { id: { in: groupChatIds } },
        select: {
          id: true,
          title: true,
          status: true,
          field: { select: { name: true } }
        }
      });
      games.forEach(g => { gameMap[g.id] = { ...g, fieldName: g.field?.name }; });
    }

    // Pre-fetch Unread Message Counts (Bulk query avoiding N+1)
    const chatIds = participations.map(p => p.chatId);
    
    let unreadMap = {};
    if (chatIds.length > 0) {
      const unreadCounts = await prisma.message.groupBy({
        by: ['chatRoomId'],
        where: {
          chatRoomId: { in: chatIds },
          userId: { not: userId },
          status: { not: 'read' }
        },
        _count: { id: true }
      });
      
      unreadMap = unreadCounts.reduce((acc, curr) => {
        acc[curr.chatRoomId] = curr._count.id;
        return acc;
      }, {});
    }

    const results = participations.map((p) => {
      const chat = p.chat;
      // For private chats, the "other" user is the name/image
      const otherParticipant = chat.participants.find(part => part.userId !== userId)?.user;

      const lastMsg = chat.messages[0];

      // Determine Chat Name
      let chatName = 'Group Chat';
      if (chat.type === 'PRIVATE') {
        chatName = otherParticipant?.name || 'Unknown';
      } else {
        // GROUP: Use Game Title if available
        const g = gameMap[chat.id];
        if (g) {
          chatName = g.title || g.fieldName || 'Game Chat';
        }
      }

      return {
        id: chat.id,
        type: chat.type.toLowerCase(), // 'private' or 'group'
        name: chatName,
        image: chat.type === 'PRIVATE' ? (otherParticipant?.imageUrl || null) : null,
        otherUserId: chat.type === 'PRIVATE' ? otherParticipant?.id : undefined,
        unreadCount: unreadMap[chat.id] || 0,
        lastMessage: lastMsg ? {
          text: lastMsg.text,
          createdAt: lastMsg.createdAt,
          senderId: lastMsg.userId,
          status: lastMsg.status
        } : null
      };
    });

    const parsedChats = results.filter(Boolean);

    // Sort by last message time
    parsedChats.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json(parsedChats);
  } catch (e) {
    console.error('Get chats error:', e);
    res.status(500).json({ error: 'Failed to get chats' });
  }
});

module.exports = router; 