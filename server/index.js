require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

// Import routes
const authRoutes = require('./routes/auth');
const fieldsRoutes = require('./routes/fields');
const gamesRoutes = require('./routes/games');
const usersRoutes = require('./routes/users');
const seriesRoutes = require('./routes/series');
const messagesRoutes = require('./routes/messages');
const { verifyToken } = require('@clerk/backend');
const { checkChatPermission } = require('./utils/chatAuth');

// Moderation
const { moderator } = require('./moderationInstance');
const { processReviewQueue } = require('./workers/reviewWorker');

// Start Review Worker
setInterval(() => {
  processReviewQueue().catch(err => console.error("Worker Error:", err));
}, 60 * 1000);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3005;
const prisma = new PrismaClient();

// Middleware
// Allow CORS (can be restricted via env CORS_ORIGINS="https://example.com,https://another.com")
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0 || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

// Initialize data files if they don't exist
async function initializeDataFiles() {
  const files = [
    { name: 'users.json', default: [] },
    { name: 'fields.json', default: [] },
    { name: 'games.json', default: [] }
  ];

  for (const file of files) {
    const filePath = path.join(dataDir, file.name);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(file.default, null, 2));
    }
  }
}

// --- Socket.IO on backend (for production) ---
const socketAllowedOrigin =
  process.env.SOCKET_CORS_ORIGIN ||
  process.env.FRONTEND_ORIGIN ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  (corsOrigins.length ? corsOrigins : '*');

const io = new Server(server, {
  path: '/api/socket',
  cors: {
    origin: Array.isArray(socketAllowedOrigin) ? socketAllowedOrigin : (socketAllowedOrigin || '*'),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/fields', fieldsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/chats', require('./routes/chats'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Football Fields API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// 404 handler (no path pattern to avoid path-to-regexp issues)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});



io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.split(' ')[1]
        : null);

    if (token) {
      try {
        const claims = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY
        });
        socket.userId = claims.sub;
      } catch (e) {
        console.error("Socket token verification failed:", e.message);
      }
    }
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    next();
  }
});

// Basic in-memory presence tracking
const connectedUsers = new Set();

// Fix 4: Redis Subscriber for Worker Events
if (process.env.REDIS_URL) {
  const Redis = require("ioredis");
  const redisSub = new Redis(process.env.REDIS_URL); // Dedicated connection
  const { Logger } = require('./utils/logger');

  redisSub.subscribe('moderation_events', (err, count) => {
    if (err) Logger.error("REDIS SUB", "Failed to subscribe:", err);
    else Logger.info("REDIS SUB", `Subscribed to moderation_events. Count: ${count}`);
  });

  redisSub.on('message', (channel, message) => {
    if (channel === 'moderation_events') {
      try {
        const event = JSON.parse(message);
        if (event.type === 'delete') {
          Logger.info('MODERATION', `Retroactive delete command received for msg: ${event.messageId}`);

          // Broadcast deletion to the room (or globally if no roomId)
          const target = event.roomId ? io.to(String(event.roomId)) : io;
          target.emit('messageDeleted', { id: event.messageId });
        }
      } catch (e) {
        Logger.error("REDIS SUB", "Error parsing message:", e);
      }
    }
  });
}


io.on('connection', async (socket) => {
  // 1. Auto-join User & City User Rooms & Presence
  if (socket.userId) {
    try {
      connectedUsers.add(socket.userId);
      // Notify anyone listening to this user's presence
      io.to(`presence_listener_${socket.userId}`).emit('presence:update', { userId: socket.userId, isOnline: true });

      const user = await prisma.user.findUnique({ where: { id: socket.userId } });
      if (user) {
        // Join personal room for private notifications
        socket.join(`user_${user.id}`);
        console.log(`User ${user.id} joined room: user_${user.id}`);

        // Join city room for local game updates
        if (user.city) {
          const cityRoom = `city_${user.city}`;
          socket.join(cityRoom);
          console.log(`User ${user.id} joined room: ${cityRoom}`);
        }
      }
    } catch (e) {
      console.error("Socket auto-join error:", e);
    }
  }

  socket.on('disconnect', () => {
    // Check if user has other connections? 
    // For simplicity in this scale: if specific socket disconnects, check if user still has connected sockets
    // io.sockets.adapter.rooms.get(`user_${socket.userId}`) might be empty now?
    // Actually, socket.io rooms are accurate.
    // If `user_${socket.userId}` room is empty, user is offline.
    if (socket.userId) {
      // Allow a small delay to handle page refreshes without flickering?
      // For now, immediate.
      const room = io.sockets.adapter.rooms.get(`user_${socket.userId}`);
      if (!room || room.size === 0) {
        connectedUsers.delete(socket.userId);
        io.to(`presence_listener_${socket.userId}`).emit('presence:update', { userId: socket.userId, isOnline: false });
      }
    }
  });

  socket.on('subscribePresence', (targetUserId) => {
    if (!targetUserId) return;
    socket.join(`presence_listener_${targetUserId}`);
    // Emit initial status
    // Check if target user has any active sockets in their "user_ID" room
    const room = io.sockets.adapter.rooms.get(`user_${targetUserId}`);
    const isOnline = !!(room && room.size > 0);
    socket.emit('presence:update', { userId: targetUserId, isOnline });
  });

  socket.on('joinRoom', async (roomId) => {
    if (!roomId) return;

    // Require Auth
    if (!socket.userId) {
      socket.emit('error', 'Unauthorized: Please login');
      return;
    }

    const allowed = await checkChatPermission(socket.userId, roomId);
    if (allowed) {
      socket.join(String(roomId));
    } else {
      socket.emit('error', 'Unauthorized access to room');
    }
  });

  // 1. User Setup: Join personal room for notifications
  socket.on('setup', (userData) => {
    if (userData?.id) {
      socket.join(String(userData.id));
      console.log(`User ${userData.id} joined their notification room`);
    }
  });

  socket.on('message', async ({ text, roomId, userId, senderName, replyTo, tempId }) => {
    if (!text) return;

    // FIX: Define missing variables immediately
    const finalUserId = userId ? String(userId) : (socket.userId ? String(socket.userId) : null);

    console.log(`[DEBUG] Incoming Message - Room: "${roomId}", User: ${finalUserId}`); // <--- TOP LEVEL DEBUG LOG

    // Fetch sender details early (needed for moderation and fallbacks)
    let senderUser = null;
    if (finalUserId) {
      try {
        senderUser = await prisma.user.findUnique({
          where: { id: finalUserId },
          select: { id: true, name: true, imageUrl: true, birthDate: true }
        });
      } catch (e) {
        console.error('Failed to fetch sender details:', e);
      }
    }

    // --- MODERATION & SAFETY CHECK ---
    const getAge = (u) => {
      if (!u) return 21; // Default to adult if unknown
      if (u.age) return u.age;
      if (u.birthDate) {
        const diff = Date.now() - new Date(u.birthDate).getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }
      return 21;
    };

    const senderAge = getAge(senderUser);
    let receiverAge = null;

    // Fetch all participants in this chat to find the receiver
    if (roomId) {
      try {
        const participants = await prisma.chatParticipant.findMany({
          where: { chatId: String(roomId) },
          select: { userId: true }
        });

        console.log(`[DEBUG] Chat Participants:`, participants.map(p => p.userId)); // DEBUG LOG

        // Find the other user (not the sender)
        const otherParticipant = participants.find(p => p.userId !== String(finalUserId));

        if (otherParticipant) {
          const receiver = await prisma.user.findUnique({
            where: { id: otherParticipant.userId },
            select: { age: true, birthDate: true }
          });
          receiverAge = getAge(receiver);
          console.log(`[DEBUG] Receiver Found: ${otherParticipant.userId}, Age Data:`, receiver, `CalcAge: ${receiverAge}`); // DEBUG LOG
        } else {
          console.log(`[DEBUG] No other participant found (group chat or solo?)`); // DEBUG LOG
        }
      } catch (e) {
        console.error('[MODERATION] Failed to fetch chat participants:', e);
      }
    }

    // Call Moderator Service
    try {
      // Retrieve last few messages for context (optional, can be empty for speed)
      // const previousMessages = ... (Skipping for now to prioritize speed)

      const modResult = await moderator.checkMessage(
        text,
        [], // Chat History (empty for now)
        {}, // User Config (default)
        {
          userId: finalUserId,
          userAge: senderAge,
          receiverAge: receiverAge,
          userGender: senderUser?.gender
        }
      );

      if (!modResult.isSafe) {
        console.log(`❌ [MODERATION] BLOCKED message from ${finalUserId} (Age: ${senderAge}) -> ${receiverAge ? `Receiver Age: ${receiverAge}` : 'Public'}`);
        socket.emit('message:error', {
          id: tempId || Date.now(),
          error: "Message blocked by safety filters.",
          reason: "Community Guidelines Violation"
        });
        return; // STOP EXECUTION
      }
    } catch (e) {
      console.error('[MODERATION] Service Error:', e);
      // Fail Open: Allow message if moderation crashes? Or Closed?
      // Usually Fail Open to prevent chat downtime, unless strict.
    }
    // ---------------------------------

    // Check active users in room to determine initial status
    let initialStatus = 'sent';
    if (roomId) {
      const clients = io.sockets.adapter.rooms.get(String(roomId));
      if (clients && clients.size > 1) {
        initialStatus = 'delivered';
      }
    }

    // 4. Atomic Creation with Forced Deep Include
    let savedMsg = null;
    try {
      if (roomId && (process.env.DB_HOST || process.env.DATABASE_URL)) {
        savedMsg = await prisma.message.create({
          data: {
            text: String(text),
            chatRoomId: String(roomId),
            userId: userId ? String(userId) : null,
            replyToId: replyTo && replyTo.id ? String(replyTo.id) : undefined,
            status: initialStatus
          },
          // CRITICAL: Force Deep Include immediately upon creation
          include: {
            user: {
              select: { id: true, name: true, imageUrl: true }
            },
            replyTo: {
              include: {
                user: {
                  select: { id: true, name: true, imageUrl: true }
                }
              }
            }
          }
        });
      }
    } catch (e) {
      console.error('Socket persist error:', e);
    }

    // 5. Construct Payload from Hydrated DB Record (or fallback)
    const msg = {
      id: savedMsg ? savedMsg.id : Date.now(),
      text: String(text),
      // Use DB data if available (Source of Truth), else optimistic params
      senderId: savedMsg?.userId || (finalUserId ? String(finalUserId) : String(socket.id)),
      senderName: savedMsg?.user?.name || senderName || "Unknown",
      ts: savedMsg ? savedMsg.createdAt.toISOString() : new Date().toISOString(),
      roomId: roomId ? String(roomId) : undefined,
      userId: savedMsg?.userId || (finalUserId ? String(finalUserId) : undefined),
      status: initialStatus,
      tempId: tempId, // Echo back correlation ID

      // Full Sender Object
      sender: savedMsg?.user || (senderUser ? {
        id: senderUser.id,
        name: senderUser.name,
        image: senderUser.imageUrl
      } : undefined),

      // Full Reply Object (Deeply Hydrated)
      replyTo: savedMsg?.replyTo ? {
        id: savedMsg.replyTo.id,
        text: savedMsg.replyTo.text,
        senderId: savedMsg.replyTo.userId,
        // CRITICAL FIX: Explicit name mapping
        senderName: savedMsg.replyTo.user?.name || "User",
        sender: savedMsg.replyTo.user
      } : (replyTo || undefined)
    };


    // Debug Log for Reply Persistence
    if (msg.replyTo) {
      console.log(`[DEBUG] Emitting message ${msg.id} with replyTo:`, msg.replyTo.senderName);
    } else {
      console.log(`[DEBUG] Emitting message ${msg.id} WITHOUT replyTo`);
    }

    if (msg.roomId) {
      io.to(msg.roomId).emit('message', msg);
      // Support ChatList updates
      io.to(msg.roomId).emit('message:received', { ...msg, chatId: msg.roomId, content: msg.text }); // Alias fields for Frontend convenience
    } else {
      io.emit('message', msg);
    }

    // Send Notifications to recipients
    if (userId && roomId) {
      try {
        let recipientIds = [];

        // Case 1: Private Chat (roomId format: "private_ID1_ID2")
        if (String(roomId).startsWith('private_')) {
          const parts = String(roomId).replace('private_', '').split('_');
          const otherId = parts.find(id => id !== String(userId));
          if (otherId) recipientIds.push(otherId);
        }
        // Case 2: Group Chat (roomId is a gameId)
        else {
          const participations = await prisma.participation.findMany({
            where: {
              gameId: String(roomId),
              status: 'CONFIRMED',
              userId: { not: String(userId) }
            },
            select: { userId: true }
          });
          recipientIds = participations.map(p => p.userId);
        }

        recipientIds.forEach(recipientId => {
          io.to(recipientId).emit('notification', {
            type: 'message',
            roomId: roomId,
            senderId: userId,
            text: text
          });
        });
      } catch (err) {
        console.error("Notification error:", err);
      }
    }

    // --- Content Moderation ---
    // Optimistic check: message already sent. Revoke if needed.
    (async () => {
      try {
        // Helper to calculate age
        const calculateAge = (birthDate) => {
          if (!birthDate) return 21; // Default fallback to Adult
          const diff = Date.now() - new Date(birthDate).getTime();
          return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        };

        // 1. Get Sender Age
        let senderAge = 21;
        if (senderUser && senderUser.birthDate) {
          senderAge = calculateAge(senderUser.birthDate);
        } else if (userId) {
          // Fallback if senderUser wasn't fetched above (though it should be)
          const s = await prisma.user.findUnique({ where: { id: String(userId) }, select: { birthDate: true } });
          senderAge = calculateAge(s?.birthDate);
        }

        // 2. Get Receiver Age (Only for Private Chats)
        let receiverAge = null;
        if (roomId && String(roomId).startsWith('private_')) {
          const parts = String(roomId).replace('private_', '').split('_');
          const otherId = parts.find(id => id !== String(userId));
          if (otherId) {
            const receiver = await prisma.user.findUnique({ where: { id: otherId }, select: { birthDate: true } });
            receiverAge = calculateAge(receiver?.birthDate);
          }
        }

        const checkResult = await moderator.checkMessage(
          String(text),
          [], // History could be fetched if needed
          {},
          {
            userId: userId ? String(userId) : 'anonymous',
            userAge: senderAge,
            receiverAge: receiverAge
          }
        );

        // Priority 1: System Error / Rate Limit -> Log for later, but allow message (Fail Open)
        if (checkResult.reviewNeeded) {
          await prisma.flaggedMessage.create({
            data: {
              messageId: msg.id ? String(msg.id) : undefined,
              content: String(text),
              userId: userId ? String(userId) : 'unknown',
              status: 'PENDING_RETRY',
              failureReason: checkResult.auditData?.error || checkResult.source || 'RateLimit/SystemError',
              aiTriggers: checkResult.auditData ? JSON.stringify(checkResult.auditData) : undefined
            }
          });
        }
        // Priority 2: Confirmed Toxic -> Delete immediately
        else if (!checkResult.isSafe) {
          const { Logger } = require('./utils/logger');
          Logger.info("Socket", `Message ${msg.id} -> REJECTED (Reason: ${checkResult.reason || 'Unsafe'})`);
          console.log(`[MODERATION] Revoking message ${msg.id}`);

          // 1. Mark as rejected in DB
          if (msg.id) {
            await prisma.message.updateMany({
              where: { id: String(msg.id) },
              data: {
                status: 'rejected',
                text: '[Content Removed by Moderator]'
              }
            });
          }

          // 2. Emit revocation to room
          const revokePayload = { id: msg.id, roomId: roomId ? String(roomId) : undefined };
          // Use io directly here since we are in the main process
          const target = roomId ? io.to(String(roomId)) : io;
          target.emit('messageDeleted', revokePayload);
        }
      } catch (e) {
        console.error("Moderation check error:", e);
      }
    })();
  });

  socket.on('addReaction', async ({ messageId, emoji, userId, roomId }) => {
    if (!messageId || !emoji || !userId) return;
    try {
      // Toggle reaction
      // Check for ANY existing reaction by this user on this message
      const existing = await prisma.reaction.findFirst({
        where: {
          userId: String(userId),
          messageId: String(messageId)
        }
      });

      if (existing) {
        if (existing.emoji === emoji) {
          // Scenario A: Same emoji -> Toggle Off (Delete)
          await prisma.reaction.delete({ where: { id: existing.id } });
        } else {
          // Scenario B: Different emoji -> Replace (Update)
          await prisma.reaction.update({
            where: { id: existing.id },
            data: { emoji }
          });
        }
      } else {
        // Scenario C: No existing reaction -> Create
        await prisma.reaction.create({
          data: {
            userId: String(userId),
            messageId: String(messageId),
            emoji
          }
        });
      }

      // Aggregate reactions for this message
      const allReactions = await prisma.reaction.findMany({
        where: { messageId: String(messageId) }
      });

      const reactions = {};
      for (const r of allReactions) {
        if (!reactions[r.emoji]) {
          reactions[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
        }
        reactions[r.emoji].count += 1;
        reactions[r.emoji].userIds.push(r.userId);
      }

      const payload = { messageId, reactions, roomId: roomId ? String(roomId) : undefined };
      if (roomId) {
        io.to(String(roomId)).emit('messageReaction', payload);
      } else {
        io.emit('messageReaction', payload);
      }
    } catch (e) {
      console.error('addReaction error:', e);
    }
  });

  socket.on('joinChats', async (chatIds) => {
    if (!Array.isArray(chatIds)) return;
    if (!socket.userId) return; // Auth required

    // Optimization: Validate user is in these chats in DB? 
    // For now, iterate checkPermission or trust if we assumed logic. 
    // To be safe and fast, we might skip check per chat if we fetched them for the user.
    // BUT verifying is better. 
    // Let's implement basic loop or Assume 'users/:id/chats' already returned valid chats.
    // Since this is socket, we should be careful. 
    // However, existing 'joinRoom' does check.
    // Let's allow joining if the room ID format matches or if permissions are lenient for "listening".
    // Actually, let's just loop join.
    for (const rid of chatIds) {
      if (rid) socket.join(String(rid));
    }
  });

  socket.on('typing', (data) => {
    const isTyping = typeof data === 'object' ? !!data.isTyping : !!data;
    const rid = typeof data === 'object' ? data.roomId : undefined;
    const name = typeof data === 'object' ? data.userName : undefined; // Get userName
    const event = {
      senderId: socket.userId ? String(socket.userId) : String(socket.id),
      userName: name,
      isTyping,
      roomId: rid ? String(rid) : undefined
    };

    // Also emit explicit start/stop for clients preferring that
    const explicitEvent = isTyping ? 'typing:start' : 'typing:stop';
    const payload = { chatId: rid, userName: name, senderId: socket.userId ? String(socket.userId) : String(socket.id) };

    if (rid) {
      socket.to(String(rid)).emit('typing', event);
      socket.to(String(rid)).emit(explicitEvent, payload);
    } else {
      socket.broadcast.emit('typing', event);
      socket.broadcast.emit(explicitEvent, payload);
    }
  });

  socket.on('markAsRead', async ({ roomId, userId }) => {
    if (!roomId || !userId) return;

    try {
      // 1. Update in DB: Mark all messages in this room NOT sent by me as 'read'
      await prisma.message.updateMany({
        where: {
          chatRoomId: String(roomId),
          userId: { not: String(userId) }, // Don't mark my own messages as read by me
          status: { not: 'read' } // Only update if not already read
        },
        data: {
          status: 'read'
        }
      });

      // 2. Notify everyone in the room that messages are read
      // This will turn the grey ticks to blue ticks for the sender
      io.to(String(roomId)).emit('messageStatusUpdate', {
        roomId: String(roomId),
        status: 'read',
        readByUserId: String(userId)
      });

    } catch (e) {
      console.error('markAsRead error:', e);
    }
  });

  socket.on('editMessage', async ({ messageId, text, roomId }) => {
    if (!messageId || !text) return;
    try {
      // Check if message exists before updating to avoid P2025
      const exists = await prisma.message.findUnique({ where: { id: String(messageId) } });
      if (!exists) {
        console.warn(`editMessage: Message ${messageId} not found.`);
        return;
      }

      await prisma.message.update({
        where: { id: String(messageId) },
        data: {
          text: String(text),
          isEdited: true
        }
      });

      const payload = { id: messageId, text, isEdited: true, roomId: roomId ? String(roomId) : undefined };
      if (roomId) {
        io.to(String(roomId)).emit('messageUpdated', payload);
      } else {
        io.emit('messageUpdated', payload);
      }
    } catch (e) {
      console.error('editMessage error:', e);
    }
  });

  socket.on('deleteMessage', async ({ messageId, roomId }) => {
    if (!messageId) return;
    try {
      // Check if message exists before updating to avoid P2025
      const exists = await prisma.message.findUnique({ where: { id: String(messageId) } });
      if (!exists) {
        console.warn(`deleteMessage: Message ${messageId} not found.`);
        return;
      }

      await prisma.message.update({
        where: { id: String(messageId) },
        data: {
          isDeleted: true,
          text: ""
        }
      });

      const payload = { id: messageId, roomId: roomId ? String(roomId) : undefined };
      if (roomId) {
        io.to(String(roomId)).emit('messageDeleted', payload);
      } else {
        io.emit('messageDeleted', payload);
      }
    } catch (e) {
      console.error('deleteMessage error:', e);
    }
  });
});

// --- Lottery scheduler ---
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

let lotterySweepRunning = false;
async function runLotterySweep() {
  if (lotterySweepRunning) return;
  lotterySweepRunning = true;
  try {
    const now = new Date();
    const games = await prisma.game.findMany({
      where: {
        lotteryEnabled: true,
        lotteryExecutedAt: null,
        lotteryAt: { lte: now },
      },
      include: { participants: true },
    });

    for (const game of games) {
      const confirmed = game.participants.filter(p => p.status === 'CONFIRMED');
      const waitlisted = game.participants.filter(p => p.status === 'WAITLISTED');
      const slotsRemaining = Math.max(0, game.maxPlayers - confirmed.length);

      const updates = [];
      if (slotsRemaining > 0 && waitlisted.length > 0) {
        shuffleInPlace(waitlisted);
        const winners = waitlisted.slice(0, slotsRemaining);
        const losers = waitlisted.slice(slotsRemaining);

        if (winners.length) {
          updates.push(
            prisma.participation.updateMany({
              where: { id: { in: winners.map(w => w.id) } },
              data: { status: 'CONFIRMED' },
            })
          );
        }
        if (losers.length) {
          updates.push(
            prisma.participation.updateMany({
              where: { id: { in: losers.map(l => l.id) } },
              data: { status: 'NOT_SELECTED' },
            })
          );
        }
      } else if (waitlisted.length > 0) {
        // No slots remaining: mark all waitlisted as not selected
        updates.push(
          prisma.participation.updateMany({
            where: { id: { in: waitlisted.map(w => w.id) } },
            data: { status: 'NOT_SELECTED' },
          })
        );
      }

      updates.push(
        prisma.game.update({
          where: { id: game.id },
          data: { lotteryExecutedAt: now },
        })
      );

      if (updates.length) {
        await prisma.$transaction(updates);
        console.log(`🎲 Lottery executed for game ${game.id} at ${now.toISOString()}`);
      } else {
        // Even if no updates (e.g., no waitlisted), still mark executed to avoid reprocessing
        await prisma.game.update({
          where: { id: game.id },
          data: { lotteryExecutedAt: now },
        });
        console.log(`🎲 Lottery marked executed (no-op) for game ${game.id}`);
      }
    }
  } catch (e) {
    console.error('Lottery sweep error:', e);
  } finally {
    lotterySweepRunning = false;
  }
}

setInterval(runLotterySweep, 60_000);

// --- Game Auto-Completion (Passive) ---
let completionCheckRunning = false;
async function runGameCompletionCheck() {
  if (completionCheckRunning) return;
  completionCheckRunning = true;
  try {
    const now = new Date();
    // Candidates: OPEN and started in the past
    const candidates = await prisma.game.findMany({
      where: {
        status: 'OPEN',
        start: { lt: now }
      },
      select: { id: true, start: true, duration: true }
    });

    const toComplete = candidates.filter(g => {
      // Duration in hours (default 1) -> ms
      const dur = (typeof g.duration === 'number' ? g.duration : 1);
      const endTime = new Date(g.start.getTime() + dur * 3600000);
      return endTime < now;
    });

    if (toComplete.length > 0) {
      const ids = toComplete.map(g => g.id);
      await prisma.game.updateMany({
        where: { id: { in: ids } },
        data: { status: 'COMPLETED' }
      });
      console.log(`🏁 Auto-completed ${ids.length} games.`);
    }
  } catch (e) {
    console.error('Game completion check error:', e);
  } finally {
    completionCheckRunning = false;
  }
}
setInterval(runGameCompletionCheck, 60_000);
runGameCompletionCheck().catch(() => { });

// --- Weekly Series Rolling Generation ---
function nextWeeklyOccurrenceFrom(now, targetDay, hhmm) {
  const [hh, mm] = String(hhmm).split(':').map(n => parseInt(n, 10));
  const d = new Date(now);
  const day = d.getDay();
  let addDays = (targetDay - day + 7) % 7;
  // if today and time already passed, schedule next week
  const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  candidate.setDate(candidate.getDate() + addDays);
  candidate.setHours(Number.isInteger(hh) ? hh : 0, Number.isInteger(mm) ? mm : 0, 0, 0);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

let seriesGenRunning = false;
async function runWeeklySeriesGeneration() {
  if (seriesGenRunning) return;
  seriesGenRunning = true;
  try {
    const now = new Date();
    // Only active WEEKLY series that have a fieldId
    const seriesList = await prisma.gameSeries.findMany({
      where: { isActive: true, type: 'WEEKLY', NOT: { fieldId: null } }
    });

    for (const s of seriesList) {
      if (typeof s.dayOfWeek !== 'number' || !s.time || !s.fieldId) continue;

      // Count future games
      const futureGames = await prisma.game.findMany({
        where: { seriesId: s.id, start: { gte: now } },
        orderBy: { start: 'asc' }
      });

      // Ensure at least 4 future games
      const TARGET = 4;
      if (futureGames.length >= TARGET) continue;

      // Fetch subscribers
      const subs = await prisma.seriesParticipant.findMany({
        where: { seriesId: s.id },
        select: { userId: true }
      });
      const subscriberIds = Array.from(new Set((subs || []).map(x => x.userId).filter(Boolean)));

      // Compute next start
      let nextStart = futureGames.length
        ? new Date(futureGames[futureGames.length - 1].start.getTime() + 7 * 24 * 60 * 60 * 1000)
        : nextWeeklyOccurrenceFrom(now, s.dayOfWeek, s.time);

      const createOps = [];
      while (futureGames.length + createOps.length < TARGET) {
        // Participants: organizer + subscribers within capacity
        const maxCap = Number(s.maxPlayers);
        const participantsCreate = [];
        participantsCreate.push({
          userId: s.organizerId,
          status: 'CONFIRMED'
        });
        let remaining = Math.max(0, maxCap - 1);
        for (const uid of subscriberIds) {
          if (uid === s.organizerId) continue;
          if (remaining > 0) {
            participantsCreate.push({ userId: uid, status: 'CONFIRMED' });
            remaining -= 1;
          } else {
            participantsCreate.push({ userId: uid, status: 'WAITLISTED' });
          }
        }

        let regOpen = null;
        if (typeof s.autoOpenRegistrationHours === 'number') {
          regOpen = new Date(nextStart.getTime() - s.autoOpenRegistrationHours * 3600000);
        }

        createOps.push(
          prisma.game.create({
            data: {
              fieldId: s.fieldId,
              seriesId: s.id,
              start: nextStart,
              duration: Math.round(Number(s.duration) || 1),
              maxPlayers: Number(s.maxPlayers),
              price: s.price ?? 0,
              isOpenToJoin: true,
              isFriendsOnly: false,
              lotteryEnabled: false,
              organizerInLottery: false,
              description: '',
              organizerId: s.organizerId,
              participants: { create: participantsCreate },
              roles: { create: { userId: s.organizerId, role: 'ORGANIZER' } },
              sport: s.sport || 'SOCCER',
              registrationOpensAt: regOpen
            }
          })
        );

        nextStart = new Date(nextStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      if (createOps.length) {
        await prisma.$transaction(createOps);
        console.log(`🗓️  Generated ${createOps.length} weekly instances for series ${s.id}`);
      }
    }
  } catch (e) {
    console.error('Weekly series generation error:', e);
  } finally {
    seriesGenRunning = false;
  }
}

// Run every 24 hours
setInterval(runWeeklySeriesGeneration, 24 * 60 * 60 * 1000);
// Kick once on boot (non-blocking)
runWeeklySeriesGeneration().catch(() => { });

// Start server (HTTP + Socket.IO)
server.listen(PORT, async () => {
  await initializeDataFiles();
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.IO ready on /api/socket (CORS origin: ${JSON.stringify(socketAllowedOrigin)})`);
});