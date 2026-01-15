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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/fields', fieldsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/messages', messagesRoutes);

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

// --- Socket.IO on backend (for production) ---
const socketAllowedOrigin =
  process.env.SOCKET_CORS_ORIGIN ||
  process.env.FRONTEND_ORIGIN ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  (corsOrigins.length ? corsOrigins : '*');

const io = new Server(server, {
  path: '/api/socket',
  cors: {
    // allow array or string; if array provided by env, use it as-is
    origin: Array.isArray(socketAllowedOrigin) ? socketAllowedOrigin : (socketAllowedOrigin || '*'),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.on('joinRoom', (roomId) => {
    if (roomId) socket.join(String(roomId));
  });

  socket.on('message', async ({ text, roomId, userId, senderName, replyTo }) => {
    if (!text) return;
    const msg = {
      id: Date.now(),
      text: String(text),
      senderId: String(socket.id),
      senderName: senderName,
      ts: new Date().toISOString(),
      roomId: roomId ? String(roomId) : undefined,
      userId: userId ? String(userId) : undefined,
      replyTo: replyTo || undefined
    };
    // Persist if DB configured and room message
    if (msg.roomId && (process.env.DB_HOST || process.env.DATABASE_URL)) {
      try {
        await prisma.message.create({
          data: {
            roomId: msg.roomId,
            text: msg.senderName ? `${msg.senderName}: ${msg.text}` : msg.text,
            userId: msg.userId || null,
            replyToId: replyTo && replyTo.id ? String(replyTo.id) : undefined
          },
        });
      } catch (e) {
        console.error('socket persist error:', e.message);
      }
    }
    if (msg.roomId) {
      io.to(msg.roomId).emit('message', msg);
    } else {
      io.emit('message', msg);
    }
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

  socket.on('typing', (data) => {
    const isTyping = typeof data === 'object' ? !!data.isTyping : !!data;
    const rid = typeof data === 'object' ? data.roomId : undefined;
    const event = { senderId: String(socket.id), isTyping, roomId: rid ? String(rid) : undefined };
    if (rid) {
      socket.to(String(rid)).emit('typing', event);
    } else {
      socket.broadcast.emit('typing', event);
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