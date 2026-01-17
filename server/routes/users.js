const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../utils/auth');
const router = express.Router();
const prisma = new PrismaClient();

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

// Public user profile (safe fields)
router.get('/:id', async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        sports: { include: { sport: true } },
        positions: { include: { position: true } }
      }
    });
    if (!user) {
      // create a minimal placeholder so users appear in listings
      await prisma.user.create({ data: { id: req.params.id } });
      user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { sports: { include: { sport: true } }, positions: { include: { position: true } } }
      });
    }
    res.json(mapUserPublic(user));
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
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
        select: { id: true, title: true, fieldName: true }
      });
      games.forEach(g => { gameMap[g.id] = g; });
    }

    const parsedChats = await Promise.all(participations.map(async (p) => {
      const chat = p.chat;
      // For private chats, the "other" user is the name/image
      const otherParticipant = chat.participants.find(part => part.userId !== userId)?.user;

      const lastMsg = chat.messages[0];

      // Count unread messages
      const unreadCount = await prisma.message.count({
        where: {
          chatRoomId: chat.id,
          userId: { not: userId },
          status: { not: 'read' }
        }
      });

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
        unreadCount,
        lastMessage: lastMsg ? {
          text: lastMsg.text,
          createdAt: lastMsg.createdAt,
          senderId: lastMsg.userId,
          status: lastMsg.status
        } : null
      };
    }));

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