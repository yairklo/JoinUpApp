require('./lib/loadEnv').loadEnv();

const { captureException } = require('./lib/sentry');

// Surface fatal errors in Render logs instead of silent 502s
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err?.stack || err);
  captureException(err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

const express = require('express');
const cors = require('cors');
const { createCorsOriginCallback } = require('./utils/corsOrigin');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const { Server } = require('socket.io');
const { prisma } = require('./lib/prisma');
const { createClient, closeSharedRedis, isRedisHealthy, getRedis } = require('./lib/redis');
const { attachSocketAdapter } = require('./socket/adapter');
const { isUserOnline, hasOtherUserInRoom } = require('./utils/socketPresence');
const { createTempIdDedupe } = require('./utils/tempIdDedupe');
const { setChatView, canSocketMarkRead } = require('./utils/chatViewState');

// Import routes
const fieldsRoutes = require('./routes/fields');
const gamesRoutes = require('./routes/games');
const usersRoutes = require('./routes/users');
const seriesRoutes = require('./routes/series');
const manageRoutes = require('./routes/manage');
const messagesRoutes = require('./routes/messages');
const notificationsRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const { verifyToken } = require('@clerk/backend');
const blocks = require('./utils/blocks');
const { getPrivateChatBlock, getBlockersAmong, ephemeralCuid } = blocks;
const { checkChatPermission, checkChatPermissionsBatch } = require('./utils/chatAuth');
const { canSubscribePresence } = require('./utils/presenceAuth');
const { mapUserToSender } = require('./utils/chatMappers');
const { NotificationService } = require('./services/notificationService');
const { broadcastCounters } = require('./services/counterService');

// Moderation
const { moderator } = require('./moderationInstance');
const { isAgeGateEnforced } = require('./utils/ageGatePolicy');
const { getAgeGateStatus, AGE_GATE_STATUS } = require('./shared/ageGate');
const { MAX_MESSAGE_LENGTH, validateMessageText, sendRateLimiter, assessOutgoingMessage } = require('./services/chatSafety');
const { notificationName, publicDisplayName } = require('./utils/publicName');
const { applyMessageEdit, applyMessageDelete } = require('./services/messageEvidence');

// Notification Workers
const { startCleanupWorker, stopCleanupWorker } = require('./workers/cleanupWorker');
const gameScheduler = require('./services/gameScheduler');
const { createLeaderLock } = require('./services/leaderLock');
const { createJobsRuntime } = require('./services/jobsRuntime');

// Jest skips timers so --detectOpenHandles stays clean. This flag means "this process MAY host
// the background jobs". Without JOBS_LEADER_LOCK=redis every such process runs them, so extra
// API instances must set RUN_BACKGROUND_JOBS=false. With JOBS_LEADER_LOCK=redis any number of
// processes may leave it on: only the Redis lock holder actually runs the jobs.
const enableBackgroundSchedulers =
  process.env.NODE_ENV !== 'test'
  && !process.env.JEST_WORKER_ID
  && process.env.RUN_BACKGROUND_JOBS !== 'false'
  && process.env.RUN_BACKGROUND_JOBS !== '0';

const enableHttpServer =
  !process.env.JEST_WORKER_ID
  && process.env.RUN_HTTP_SERVER !== 'false'
  && process.env.RUN_HTTP_SERVER !== '0';

const enableRedis =
  !!process.env.REDIS_URL
  && !process.env.JEST_WORKER_ID
  && process.env.NODE_ENV !== 'test';

// JOBS_LEADER_LOCK=redis: elect a single job runner among all job-capable processes.
// If REDIS_URL is missing the lock cannot work: run jobs directly (single-instance behaviour
// as before) and say so loudly.
const wantsLeaderLock = process.env.JOBS_LEADER_LOCK === 'redis';
const useLeaderLock = wantsLeaderLock && enableRedis;
if (wantsLeaderLock && !useLeaderLock && !process.env.JEST_WORKER_ID) {
  console.warn('[JOBS] JOBS_LEADER_LOCK=redis but REDIS_URL is not set: running jobs without a lock (single instance only)');
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3005;
const notificationService = new NotificationService(prisma);

// Middleware — CORS for Web (Vercel/local) + no-origin clients (mobile / Postman / Expo)
const WEB_ALLOWED_ORIGINS = [
  'https://join-up-app.vercel.app',
  'http://localhost:3000',
];

const allowedOrigins = [
  ...WEB_ALLOWED_ORIGINS,
  ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
].filter((origin, i, arr) => arr.indexOf(origin) === i);

const isProduction = process.env.NODE_ENV === 'production';
// Staging on Render may still set NODE_ENV=production — opt in via CORS_PERMISSIVE=true
const corsPermissive =
  process.env.CORS_PERMISSIVE === 'true' || process.env.CORS_PERMISSIVE === '1' || !isProduction;

const corsOriginCallback = createCorsOriginCallback({ allowedOrigins, permissive: corsPermissive });
// Socket.IO must abort disallowed handshakes with an Error — see utils/corsOrigin.js.
const socketCorsOriginCallback = createCorsOriginCallback({
  allowedOrigins,
  permissive: corsPermissive,
  rejectWithError: true,
});

app.use(
  cors({
    origin: corsOriginCallback,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Request-Id'],
  })
);
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { requestContext } = require('./middleware/requestContext');
const { createRateLimiter, writeMethodLimiter, readMethodLimiter } = require('./middleware/rateLimit');
app.use(requestContext);
// Read/polling traffic (GET/HEAD). One signed-in screen fires about 12-15 GETs (the
// screen plus users/me, notification counts, the notification list, chats and tournament
// capabilities). 120/minute per IP is only ~8 of those screens, so a short burst of reloads
// 429s and the page then paints empty. Signed-in reads are counted per Clerk user at
// 300/minute, enough for that burst and ordinary navigation, still inside one minute so a
// runaway loop recovers quickly. Guests stay on the IP bucket at 120/minute.
app.use(readMethodLimiter(createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  anonymousMax: 120,
  prefix: 'read',
})));
// Mutations (POST/PUT/PATCH/DELETE) keep the existing, deliberately stricter limiter untouched.
app.use(writeMethodLimiter(createRateLimiter({ windowMs: 60 * 1000, max: 60, prefix: 'write' })));

require('./middleware/uploadsStatic').mountUploads(app, path.join(__dirname, 'uploads'));

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

// Render's load balancer needs an HTTP polling handshake (sticky session cookie) before
// WebSocket upgrade works for React Native clients. Web-only clients can connect via WS
// directly, but mobile RN WebSocket fails without the polling step ("websocket error").
const io = new Server(server, {
  path: '/api/socket',
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: {
    origin: socketCorsOriginCallback,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
});

// Cross-instance delivery (SOCKET_ADAPTER=redis + REDIS_URL). No-op otherwise. Rooms are plain
// strings so every existing io.to(room).emit() call site works cluster-wide unchanged.
const socketAdapter = attachSocketAdapter(io);

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Store io in app for access in routes
app.set('io', io);

// Routes — legacy JSON /api/auth is intentionally unmounted (Clerk is the only IdP)
app.use('/api', require('./middleware/scrubEmailNames').scrubEmailNames);
app.use('/api/fields', fieldsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/manage', manageRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
console.log('✅ [ROUTES] Notification routes mounted at /api/notifications');
app.use('/api/chats', require('./routes/chats'));
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/user-reports', require('./routes/userReports'));
app.use('/api/field-suggestions', require('./routes/fieldSuggestions'));

// 'on' = jobs running here, 'standby' = waiting for the leader lock, 'off' = disabled.
function jobsStatus() {
  const st = jobsRuntime.state();
  if (st.mode === 'off') return 'off';
  if (st.mode === 'leader-lock') return st.active ? 'on' : 'standby';
  return 'on';
}

// Health check
let redisReady = false;
let redisPub = null;
let redisSub = null;

// Liveness probe: the container platform's healthcheck hits this every few seconds to
// decide whether to restart the container. It must stay instant and dependency-free —
// no DB/Redis round trip — otherwise it never lets Neon's compute suspend (a query every
// 5s keeps resetting Neon's 5-minute idle timer, so the DB never goes to sleep).
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    jobs: jobsStatus(),
    http: enableHttpServer ? 'on' : 'off',
    message: 'Football Fields API is running',
    requestId: req.requestId,
  });
});

// Readiness/deep check: actually touches the DB and Redis. Not meant to be polled on a
// tight loop — use it for manual debugging or a low-frequency external monitor only.
app.get('/api/health/deep', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    let redis = 'off';
    if (process.env.REDIS_URL && enableRedis) {
      try {
        if (redisPub) {
          await redisPub.ping();
          redis = 'up';
        } else {
          redis = redisReady ? 'up' : 'down';
        }
      } catch {
        redis = 'down';
      }
    }
    res.json({
      status: 'OK',
      db: 'up',
      redis,
      socketAdapter: !socketAdapter.enabled ? 'off' : (isRedisHealthy() ? 'up' : 'down'),
      jobs: jobsStatus(),
      jobLeader: jobsRuntime.state().lock,
      http: enableHttpServer ? 'on' : 'off',
      message: 'Football Fields API is running',
      requestId: req.requestId,
    });
  } catch (err) {
    console.error('[HEALTH] database check failed:', err.message);
    res.status(503).json({ status: 'DOWN', db: 'down', message: 'Database unreachable', requestId: req.requestId });
  }
});

// Extracted (not inlined into io.use) so it can be unit-tested directly with a mock socket/next,
// without needing a real socket.io-client handshake. Behavior is unchanged from the inline version.
async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization && socket.handshake.headers.authorization.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      return next(new Error('Unauthorized'));
    }

    const claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });
    socket.userId = claims.sub;
    if (!socket.userId) {
      return next(new Error('Unauthorized'));
    }
    // socket.data survives fetchSockets()/RemoteSocket, so other instances can see who is online.
    socket.data = socket.data || {};
    socket.data.userId = String(socket.userId);
    try {
      const { getClerkUserCached, isAccountDeleted } = require('./utils/auth');
      const { resolveIsBanned } = require('./utils/admin');
      const clerkUser = await getClerkUserCached(socket.userId);
      if (resolveIsBanned(clerkUser)) {
        return next(new Error('Account suspended'));
      }
      if (await isAccountDeleted(socket.userId)) {
        return next(new Error('Account deleted'));
      }
    } catch (e) {
      // Clerk lookup failure shouldn't block a socket that already has a valid JWT
      console.warn('[socket auth] ban check failed:', e.message);
    }
    next();
  } catch (err) {
    console.error("Socket token verification failed:", err.message);
    next(new Error('Unauthorized'));
  }
}

io.use(socketAuthMiddleware);

// Redis: moderation fan-out + optional worker→API socket bridge
const { SOCKET_CHANNEL, SCHEDULER_CHANNEL, createPublisherIo, applySocketEvent, localTarget } = require('./utils/socketBridge');
if (enableRedis) {
  const { Logger } = require('./utils/logger');

  // Retry forever (capped backoff): the bridge carries worker->API socket events and scheduler
  // signals, so one Redis blip must not end it permanently. ioredis re-subscribes on reconnect.
  // sub: its (re)subscribe commands queue until connected and never give up.
  // pub: fail-fast, no offline queue — events published while Redis is down are dropped instead of
  // being replayed minutes later as stale socket events / scheduler signals.
  redisSub = createClient({ label: 'bridge-sub', maxRetriesPerRequest: null });
  redisPub = createClient({ label: 'bridge-pub', failFast: true, commandTimeout: 2000 });

  redisSub.on('ready', () => { redisReady = true; });
  redisPub.on('ready', () => { redisReady = true; });

  // Any process can call gameScheduler.resyncGame()/triggerReviewQueue() from a request
  // handler even if its own scheduler isn't enabled (e.g. the web API split from a
  // dedicated `worker.js` jobs process) — forward the signal to whichever process is
  // actually subscribed to SCHEDULER_CHANNEL below.
  gameScheduler.setPublisher((msg) => {
    Promise.resolve(redisPub.publish(SCHEDULER_CHANNEL, JSON.stringify(msg)))
      .catch((err) => Logger.warn('SCHEDULER', `signal publish failed: ${err.message}`));
  });

  const channels = ['moderation_events'];
  if (enableHttpServer) channels.push(SOCKET_CHANNEL);
  // Every job-capable process listens; only the one whose scheduler is enabled (the leader, or
  // the sole job runner) acts on a signal. See gameScheduler.handleSignal.
  if (enableBackgroundSchedulers) channels.push(SCHEDULER_CHANNEL);
  redisSub.subscribe(...channels, (err, count) => {
    if (err) Logger.error("REDIS SUB", "Failed to subscribe:", err);
    else Logger.info("REDIS SUB", `Subscribed. Count: ${count}`);
  });

  redisSub.on('message', (channel, message) => {
    if (channel === SOCKET_CHANNEL) {
      try {
        applySocketEvent(io, JSON.parse(message));
      } catch (e) {
        Logger.error("REDIS SUB", "Error parsing socket bridge message:", e);
      }
      return;
    }
    if (channel === SCHEDULER_CHANNEL) {
      try {
        gameScheduler.handleSignal(JSON.parse(message))
          .catch(err => Logger.error('SCHEDULER', 'signal handling failed:', err));
      } catch (e) {
        Logger.error("REDIS SUB", "Error parsing scheduler bridge message:", e);
      }
      return;
    }
    if (channel === 'moderation_events') {
      try {
        const event = JSON.parse(message);
        if (event.type === 'delete') {
          Logger.info('MODERATION', `Retroactive delete command received for msg: ${event.messageId}`);
          // Local-only: every instance receives this message itself (see utils/socketBridge.js).
          const local = localTarget(io);
          const target = event.roomId ? local.to(String(event.roomId)) : local;
          target.emit('messageDeleted', { id: event.messageId });
        }
      } catch (e) {
        Logger.error("REDIS SUB", "Error parsing message:", e);
      }
    }
  });
}


// tempIds of messages accepted/in flight per sender+room, so client retries are idempotent.
// CHAT_DEDUPE_STORE=redis also shares the claim across instances (retry after failover);
// default is per-process memory.
const tempIdDedupe = createTempIdDedupe({
  client: process.env.CHAT_DEDUPE_STORE === 'redis' ? getRedis() : null,
});
const SEND_PROCESS_TIMEOUT_MS = 20000;

function aggregateReactions(rows) {
  const reactions = {};
  for (const r of rows) {
    if (!reactions[r.emoji]) {
      reactions[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    }
    reactions[r.emoji].count += 1;
    reactions[r.emoji].userIds.push(r.userId);
  }
  return reactions;
}

/**
 * Private-chat block for a socket actor. Group chats are `{ blocked: false }`.
 * A lookup error fails closed (`{ error: true }`) so a blip cannot deliver typing,
 * read receipts, reactions, or edits across a block.
 * Called through `blocks.getPrivateChatBlock` (not a destructured copy) so tests can spy it.
 */
async function readPrivateChatBlock(userId, roomId) {
  try {
    const block = await blocks.getPrivateChatBlock(userId, roomId);
    if (!block) return { blocked: false };
    return { blocked: true, senderIsBlocked: !!block.senderIsBlocked };
  } catch (e) {
    console.error('[blocks] private chat block check failed:', e.message);
    return { error: true };
  }
}

io.on('connection', async (socket) => {
  // 1. Auto-join User & City User Rooms & Presence
  if (socket.userId) {
    // Always join the personal notification room from the Clerk ID — do not gate this on a DB
    // lookup. Organizers often connect their socket before their first upsert, and notifications
    // are addressed to user_${clerkId} regardless of whether a User row exists yet.
    socket.join(`user_${socket.userId}`);
    console.log(`User ${socket.userId} joined room: user_${socket.userId}`);

    try {
      const user = await prisma.user.findUnique({ where: { id: socket.userId } });
      if (user) {
        // Join city room for local game updates
        if (user.city) {
          const cityRoom = `city_${user.city}`;
          socket.join(cityRoom);
          console.log(`User ${user.id} joined room: ${cityRoom}`);
        }

        // Presence: online once the socket is in user_${id}
        io.to(`presence_listener_${user.id}`).emit('presence:update', { userId: user.id, isOnline: true });
      }
    } catch (e) {
      console.error("Socket auto-join error:", e);
    }
  }

  socket.on('disconnect', async () => {
    // The socket has already left its rooms. If `user_<id>` is now empty on EVERY instance
    // (cluster-wide via fetchSockets), the user is offline. Two last tabs on different nodes
    // closing in the same instant can both still see the other; accepted (presence is approximate).
    if (socket.userId) {
      try {
        if (!(await isUserOnline(io, socket.userId))) {
          io.to(`presence_listener_${socket.userId}`).emit('presence:update', { userId: socket.userId, isOnline: false });
        }
      } catch (e) {
        console.error('[presence] disconnect check failed:', e && e.message);
      }
    }
  });

  // Presence is private: only friends, chat partners or pick-session co-managers may watch it.
  socket.on('subscribePresence', async (targetUserId) => {
    if (!targetUserId || !socket.userId) return;
    const listenerRoom = `presence_listener_${targetUserId}`;
    // Clients re-emit this for the same targets on every state change (e.g. each pick in a live
    // team-pick session). Already-authorized sockets skip the DB check; access is revoked by
    // removing them from the room (block/unfriend in routes/users.js), not by re-checking here.
    if (!socket.rooms.has(listenerRoom)) {
      if (!(await canSubscribePresence(socket.userId, targetUserId))) return;
      socket.join(listenerRoom);
    }
    // Emit initial status
    // Check if target user has any active sockets (on any instance) in their "user_ID" room
    const isOnline = await isUserOnline(io, targetUserId);
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

  socket.on('leaveRoom', (roomId) => {
    if (roomId) {
      socket.leave(String(roomId));
    }
  });

  // Client-initiated room join — only the caller's own notification room
  socket.on('join', (room) => {
    if (typeof room === 'string' && socket.userId && room === `user_${socket.userId}`) {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    }
  });

  // Live tournament updates (`tournament:update`): only viewers allowed to see the tournament.
  socket.on('joinTournament', async (tournamentId) => {
    try {
      if (typeof tournamentId !== 'string' || !tournamentId) return;
      const { canViewTournament } = require('./utils/tournamentAccess');
      const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
      const viewer = socket.userId ? { id: socket.userId, isAdmin: !!socket.data?.isAdmin } : null;
      if (t && (await canViewTournament(prisma, t, viewer))) socket.join(`tournament:${tournamentId}`);
    } catch (e) {
      console.warn('[socket] joinTournament failed:', e && e.message);
    }
  });

  socket.on('leaveTournament', (tournamentId) => {
    if (typeof tournamentId === 'string') socket.leave(`tournament:${tournamentId}`);
  });

  // Live team-management pick room (managers)
  socket.on('joinPickSession', async (gameId) => {
    try {
      if (!socket.userId || !gameId) return;
      const { buildPickSessionState, canAccessPickSession } = require('./services/pickSessionService');
      const allowed = await canAccessPickSession(String(gameId), String(socket.userId));
      if (!allowed) {
        socket.emit('error', 'Unauthorized: managers only');
        return;
      }
      const room = `game_pick_${gameId}`;
      socket.join(room);
      io.to(room).emit('pick:presence', {
        userId: socket.userId,
        isOnline: true,
        gameId: String(gameId),
      });
      const state = await buildPickSessionState(String(gameId), socket.userId);
      socket.emit('pick:state', state);
    } catch (e) {
      console.error('joinPickSession error:', e);
    }
  });

  socket.on('leavePickSession', (gameId) => {
    if (!gameId) return;
    const room = `game_pick_${gameId}`;
    socket.leave(room);
    if (socket.userId) {
      io.to(room).emit('pick:presence', {
        userId: socket.userId,
        isOnline: false,
        gameId: String(gameId),
      });
    }
  });

  // Legacy setup event — always bind to the verified Clerk id, never a client-supplied id
  socket.on('setup', () => {
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
      console.log(`User ${socket.userId} joined their notification room via setup`);
    }
  });

  socket.on('message', async ({ text, roomId, senderName, replyTo, tempId }) => {
    if (!text || !roomId) return;

    // Tell the sender (correlated by tempId) that this send failed, so the client can show an
    // error + optional retry instead of leaving the message on a single "sending" tick forever.
    // Moderation blocks are NOT failures: they come back as a normal echo with status 'blocked'.
    let dedupeKey = null;
    const fail = (error, code, retryable) => {
      if (dedupeKey) tempIdDedupe.release(dedupeKey);
      socket.emit('error', error);
      if (tempId !== undefined && tempId !== null) {
        socket.emit('messageFailed', { tempId, roomId: String(roomId), code, retryable });
      }
    };

    if (!socket.userId) {
      fail('Unauthorized: Please login', 'UNAUTHORIZED', false);
      return;
    }

    // Retries reuse the same tempId, so a retry after a lost echo must not store the message twice.
    // Already stored => re-send the stored echo to this sender (their client was left on "pending");
    // still in flight => ignore, the original will answer. Per instance by default; shared via
    // Redis when CHAT_DEDUPE_STORE=redis (see utils/tempIdDedupe.js).
    let echoStored = false;
    if (tempId !== undefined && tempId !== null) {
      const key = `${socket.userId}:${roomId}:${tempId}`;
      const claim = await tempIdDedupe.claim(key);
      if (!claim.claimed) {
        if (claim.echo) socket.emit('message', claim.echo);
        return;
      }
      dedupeKey = key;
    }

    const processMessage = async () => {
    const textError = validateMessageText(text);
    if (textError) {
      fail(textError === 'MESSAGE_TOO_LONG'
        ? `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`
        : 'Message is empty', textError, false);
      return;
    }

    if (!(await sendRateLimiter.allow(socket.userId))) {
      fail('You are sending messages too fast', 'RATE_LIMITED', true);
      return;
    }

    const allowed = await checkChatPermission(socket.userId, String(roomId));
    if (!allowed) {
      fail('Unauthorized access to room', 'FORBIDDEN', false);
      return;
    }

    const finalUserId = String(socket.userId);

    // Private-chat block between the pair, in either direction. Nothing is ever persisted or
    // delivered across it; the checks below still run so a blocked sender gets the same
    // validation, rate limiting, age gate and moderation trail as anyone else.
    let block = null;
    try {
      block = await getPrivateChatBlock(finalUserId, String(roomId));
    } catch (e) {
      // Fail closed: if we cannot tell whether the pair is blocked, do not deliver.
      console.error('[blocks] private chat block check failed:', e.message);
      fail('Could not send message', 'SEND_FAILED', true);
      return;
    }
    if (block && !block.senderIsBlocked) {
      // The sender blocked the other person. NOT retryable: older app builds retry
      // retryable failures in a loop, and this will never succeed until they unblock.
      fail('Could not send message', 'SEND_FAILED', false);
      return;
    }

    // Fetch sender details early (needed for moderation and fallbacks)
    let senderUser = null;
    if (finalUserId) {
      try {
        senderUser = await prisma.user.findUnique({
          where: { id: finalUserId },
          select: {
            id: true, name: true, imageUrl: true, birthDate: true, gender: true,
            termsAcceptedAt: true, termsVersion: true, guardianConsentAt: true,
          }
        });
      } catch (e) {
        console.error('Failed to fetch sender details:', e);
      }
    }

    if (isAgeGateEnforced() && senderUser && getAgeGateStatus(senderUser) !== AGE_GATE_STATUS.OK) {
      fail('AGE_GATE_REQUIRED', 'AGE_GATE_REQUIRED', false);
      return;
    }

    // --- MODERATION & SAFETY CHECK (AI runs only when a recipient is a minor; see services/chatSafety.js) ---
    let initialStatus;
    let recipientIds;
    try {
      ({ status: initialStatus, recipientIds } = await assessOutgoingMessage({
        moderator,
        sender: senderUser || { id: finalUserId },
        roomId: String(roomId),
        text,
        onFlagged: () => gameScheduler.triggerReviewQueue(),
      }));
    } catch (e) {
      // Fail closed: if we cannot tell who receives this (or whether they are minors), do not deliver.
      console.error('[MODERATION] Recipient/age lookup failed:', e.message);
      fail('Could not send message', 'SEND_FAILED', true);
      return;
    }

    if (block && block.senderIsBlocked && initialStatus !== 'blocked') {
      // The sender is the blocked party and moderation found nothing: ack like an ordinary
      // send so the response does not reveal the block. Only this user's own sockets see it.
      // Not stored (the other person's history must not contain it), so it is gone on reload.
      const name = publicDisplayName(senderUser?.name, null) || publicDisplayName(senderName, null) || 'משתמש';
      const echo = {
        id: ephemeralCuid(),
        text: String(text),
        senderId: finalUserId,
        senderName: name,
        ts: new Date().toISOString(),
        roomId: String(roomId),
        userId: finalUserId,
        status: 'sent',
        tempId,
        sender: { id: finalUserId, name, image: senderUser?.imageUrl || null },
      };
      // The quote is only echoed to this user's own sockets.
      if (replyTo && typeof replyTo === 'object') echo.replyTo = replyTo;
      if (dedupeKey) { echoStored = true; tempIdDedupe.storeEcho(dedupeKey, echo); }
      io.to(`user_${finalUserId}`).emit('message', echo);
      io.to(`user_${finalUserId}`).emit('message:received', { ...echo, chatId: echo.roomId, content: echo.text });
      return;
    }

    // Check active users in room to determine initial status
    if (initialStatus === 'sent') {
      // Delivered = a socket of ANOTHER user is in the room (the sender's own tabs don't count).
      if (await hasOtherUserInRoom(io, String(roomId), socket.userId)) initialStatus = 'delivered';
    }
    // ---------------------------------

    // 4. Atomic Creation with Forced Deep Include
    let savedMsg = null;
    let persistFailed = false;
    let safeReplyToId;
    try {
      if (roomId && (process.env.DB_HOST || process.env.DATABASE_URL)) {
        // Only quote a message of this room that is not moderated: quoting a blocked message
        // would deliver its text to the recipient inside a clean reply.
        if (replyTo && replyTo.id) {
          const target = await prisma.message.findUnique({
            where: { id: String(replyTo.id) },
            select: { id: true, chatRoomId: true, status: true },
          });
          if (target && target.chatRoomId === String(roomId) && target.status !== 'blocked') safeReplyToId = target.id;
        }
        savedMsg = await prisma.message.create({
          data: {
            text: String(text),
            chatRoomId: String(roomId),
            userId: finalUserId,
            replyToId: safeReplyToId,
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
      persistFailed = true;
    }

    // Never confirm (or notify recipients about) a message that was not stored.
    if (persistFailed) {
      fail('Could not send message', 'SEND_FAILED', true);
      return;
    }

    // 5. Construct Payload from Hydrated DB Record (or fallback)
    const msg = {
      id: savedMsg ? savedMsg.id : Date.now(),
      text: String(text),
      // Use DB data if available (Source of Truth), else optimistic params
      senderId: savedMsg?.userId || (finalUserId ? String(finalUserId) : String(socket.id)),
      senderName: publicDisplayName(savedMsg?.user?.name, null) || publicDisplayName(senderName, null) || "משתמש",
      ts: savedMsg ? savedMsg.createdAt.toISOString() : new Date().toISOString(),
      roomId: roomId ? String(roomId) : undefined,
      userId: savedMsg?.userId || (finalUserId ? String(finalUserId) : undefined),
      status: initialStatus,
      tempId: tempId, // Echo back correlation ID

      // Full Sender Object
      sender: mapUserToSender(savedMsg?.user) || mapUserToSender(senderUser),

      // Full Reply Object (Deeply Hydrated)
      replyTo: savedMsg?.replyTo ? {
        id: savedMsg.replyTo.id,
        text: savedMsg.replyTo.text,
        senderId: savedMsg.replyTo.userId,
        // CRITICAL FIX: Explicit name mapping
        senderName: publicDisplayName(savedMsg.replyTo.user?.name, null) || "User",
        sender: mapUserToSender(savedMsg.replyTo.user)
      } : (replyTo && !safeReplyToId && savedMsg ? undefined : (replyTo || undefined))
    };


    if (dedupeKey) { echoStored = true; tempIdDedupe.storeEcho(dedupeKey, msg); }

    if (msg.roomId) {
      if (initialStatus === 'blocked') {
        io.to(`user_${finalUserId}`).emit('message', msg);
        io.to(`user_${finalUserId}`).emit('message:received', { ...msg, chatId: msg.roomId, content: msg.text });
      } else {
        io.to(msg.roomId).emit('message', msg);
        io.to(msg.roomId).emit('message:received', { ...msg, chatId: msg.roomId, content: msg.text });
      }
    }

    // Send Notifications to recipients
    if (finalUserId && roomId && initialStatus !== 'blocked') {
      try {
        const blockers = await getBlockersAmong(finalUserId, recipientIds).catch(() => new Set());
        if (blockers.size) recipientIds = recipientIds.filter(id => !blockers.has(String(id)));

        const messagePreview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
        const pushTitle = await notificationName(
          prisma,
          { id: finalUserId, name: senderUser?.name || senderName },
          'הודעה חדשה',
        );

        recipientIds.forEach(recipientId => {

          // Refresh the recipient's Navbar/Tab unread-messages badge regardless of
          // online status (they may be connected but viewing a different screen).
          broadcastCounters(io, prisma, recipientId).catch(() => {});

          // Data Sync Event (Decoupled from Notifications) - only meaningful to connected clients
          io.to(`user_${recipientId}`).emit('chat:sync', {
            chatId: roomId,
            lastMessage: {
              text: text,
              createdAt: msg.createdAt || new Date().toISOString(),
              senderId: finalUserId,
              status: 'sent'
            },
            unreadCountIncrement: 1
          });

          // Always send push to device — client will suppress it if in foreground
          notificationService.sendPushOnly(
            recipientId,
            'NEW_MESSAGE',
            pushTitle,
            messagePreview,
            { chatId: roomId, senderId: finalUserId, actorId: finalUserId, link: `/chat/${roomId}` }
          ).catch(err => console.error('[NOTIFICATIONS] Failed to send offline message push:', err));
        });
      } catch (err) {
        console.error("[NOTIFICATIONS] Notification error:", err);
      }
    }

    // --- Legacy moderation code removed - now handled earlier in flow (lines 320-375) ---
    };

    // Any unexpected throw must reach the sender as a failure (and free the dedupe slot so a
    // retry isn't swallowed) rather than leaving the client on "pending".
    // Process one socket's messages strictly in arrival order: processMessage awaits several DB calls,
    // so without this two quick sends (or a flushed offline queue) could be stored/echoed out of order.
    const run = async () => {
      try {
        // A stuck DB/moderation call must not freeze this socket's whole send queue. On timeout the
        // sender gets a retryable failure; the dedupe slot is kept so a retry can't double-store if
        // the original does finish (it then answers with the stored echo).
        let timer;
        const timedOut = await Promise.race([
          processMessage().then(() => false),
          new Promise((resolve) => { timer = setTimeout(() => resolve(true), SEND_PROCESS_TIMEOUT_MS); }),
        ]);
        clearTimeout(timer);
        if (timedOut) {
          socket.emit('error', 'Could not send message');
          if (tempId !== undefined && tempId !== null) {
            socket.emit('messageFailed', { tempId, roomId: String(roomId), code: 'SEND_FAILED', retryable: true });
          }
        }
      } catch (e) {
        console.error('[message] unexpected send error:', e);
        if (dedupeKey && echoStored) return; // already stored + echoed; don't report a false failure
        fail('Could not send message', 'SEND_FAILED', true);
      }
    };
    const chained = (socket.sendChain || Promise.resolve()).then(run);
    socket.sendChain = chained.catch(() => {});
    await chained;
  });

  socket.on('addReaction', async ({ messageId, emoji, roomId }) => {
    if (!messageId || !emoji || !socket.userId) return;
    const userId = String(socket.userId);
    try {
      let chatId = roomId ? String(roomId) : null;
      if (!chatId) {
        const existingMsg = await prisma.message.findUnique({
          where: { id: String(messageId) },
          select: { chatRoomId: true },
        });
        chatId = existingMsg?.chatRoomId || null;
      }
      if (!chatId || !(await checkChatPermission(userId, chatId))) {
        socket.emit('error', 'Unauthorized access to room');
        return;
      }

      const gate = await readPrivateChatBlock(userId, chatId);
      if (gate.error) {
        socket.emit('error', 'Could not send message');
        return;
      }
      if (gate.blocked) {
        // The blocked party still sees their own toggle. Nothing is stored, and the
        // room (the other person) is not told. The blocker gets silence — no block code.
        if (gate.senderIsBlocked) {
          const allReactions = await prisma.reaction.findMany({
            where: { messageId: String(messageId) },
          });
          const rows = allReactions.map((r) => ({ emoji: r.emoji, userId: r.userId }));
          const mineIndex = rows.findIndex((r) => r.userId === userId);
          if (mineIndex >= 0) {
            if (rows[mineIndex].emoji === emoji) rows.splice(mineIndex, 1);
            else rows[mineIndex] = { emoji, userId };
          } else {
            rows.push({ emoji, userId });
          }
          io.to(`user_${userId}`).emit('messageReaction', {
            messageId,
            reactions: aggregateReactions(rows),
            roomId: chatId,
          });
        }
        return;
      }

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

      const reactions = aggregateReactions(allReactions);

      const payload = { messageId, reactions, roomId: chatId };
      io.to(chatId).emit('messageReaction', payload);
    } catch (e) {
      console.error('addReaction error:', e);
    }
  });

  socket.on('joinChats', async (chatIds) => {
    if (!Array.isArray(chatIds) || !socket.userId) return;
    const ids = chatIds.map((rid) => String(rid || '')).filter(Boolean).slice(0, 500);
    const allowed = await checkChatPermissionsBatch(socket.userId, ids);
    for (const rid of ids) {
      if (allowed.has(rid)) socket.join(rid);
    }
  });

  socket.on('typing', async (data) => {
    if (!socket.userId) return;
    const isTyping = typeof data === 'object' ? !!data.isTyping : !!data;
    const rid = typeof data === 'object' ? data.roomId : undefined;
    const name = typeof data === 'object' ? data.userName : undefined;
    if (!rid) return;
    if (!(await checkChatPermission(socket.userId, String(rid)))) return;
    // Either direction, and a failed lookup: the other side hears nothing.
    const typingGate = await readPrivateChatBlock(socket.userId, String(rid));
    if (typingGate.error || typingGate.blocked) return;
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
    }
  });

  // Web clients report whether a chat is really on screen (see utils/chatViewState.js).
  socket.on('chatView', (payload) => {
    const { roomId, visible } = payload || {};
    if (!roomId || !socket.userId) return;
    setChatView(socket.data, roomId, !!visible);
  });

  socket.on('markAsRead', async ({ roomId }) => {
    if (!roomId || !socket.userId) return;
    // A minimized widget / hidden chat must not turn the sender's ticks to "read".
    if (!canSocketMarkRead(socket.data, roomId)) return;
    const userId = String(socket.userId);
    if (!(await checkChatPermission(userId, String(roomId)))) return;

    try {
      // Either direction: do not emit a receipt. The status column IS the receipt
      // (GET /messages returns it), so leaving it unread is required — an update
      // without the socket event would still show blue ticks on the next load.
      // A failed lookup fails closed the same way.
      const readGate = await readPrivateChatBlock(userId, String(roomId));
      if (readGate.error) return;
      if (readGate.blocked) {
        // Receipts stay untouched, but the reader's own badge must still refresh: unread
        // counts ignore people they blocked, so opening the chat clears the old badge.
        broadcastCounters(io, prisma, userId).catch(() => {});
        return;
      }

      // 1. Update in DB: Mark all messages in this room NOT sent by me as 'read'
      const marked = await prisma.message.updateMany({
        where: {
          chatRoomId: String(roomId),
          userId: { not: String(userId) }, // Don't mark my own messages as read by me
          status: { notIn: ['read', 'blocked'] } // blocked stays blocked: never promote a moderated message to visible
        },
        data: {
          status: 'read'
        }
      });

      // 2. Notify everyone in the room that messages are read
      // This will turn the grey ticks to blue ticks for the sender
      // Skipped when nothing changed (e.g. only blocked messages are pending), so the sender is
      // never told that a message the recipient cannot see was "read".
      if (marked.count > 0) {
        io.to(String(roomId)).emit('messageStatusUpdate', {
          roomId: String(roomId),
          status: 'read',
          readByUserId: String(userId)
        });
      }

      // 3. Refresh the reader's own Navbar/Tab unread-messages badge
      broadcastCounters(io, prisma, String(userId)).catch(() => {});

    } catch (e) {
      console.error('markAsRead error:', e);
    }
  });

  socket.on('editMessage', async ({ messageId, text, roomId }) => {
    if (!messageId || !text || !socket.userId) return;
    try {
      const exists = await prisma.message.findUnique({ where: { id: String(messageId) } });
      if (!exists) {
        console.warn(`editMessage: Message ${messageId} not found.`);
        return;
      }
      if (exists.userId !== String(socket.userId)) {
        socket.emit('error', 'Unauthorized');
        return;
      }
      if (exists.isDeleted) return;
      if (!(await checkChatPermission(socket.userId, exists.chatRoomId))) return;

      // Edits go through the same AI/limits as sends, so they share the send budget.
      if (!(await sendRateLimiter.allow(socket.userId))) {
        socket.emit('error', 'You are sending messages too fast');
        return;
      }

      const textError = validateMessageText(String(text));
      if (textError) {
        socket.emit('error', textError === 'MESSAGE_TOO_LONG' ? 'Message is too long' : 'Message is empty');
        return;
      }

      const editor = await prisma.user.findUnique({
        where: { id: String(socket.userId) },
        select: { id: true, birthDate: true, gender: true },
      });
      let verdict;
      try {
        verdict = await assessOutgoingMessage({
          moderator,
          sender: editor || { id: String(socket.userId) },
          roomId: exists.chatRoomId,
          text: String(text),
          onFlagged: () => gameScheduler.triggerReviewQueue(),
        });
      } catch (e) {
        console.error('[MODERATION] Edit recipient/age lookup failed:', e.message);
        socket.emit('error', 'Could not send message');
        return;
      }
      if (verdict.status === 'blocked') {
        // Keep the original message. The sender gets an ephemeral "blocked" bubble (not
        // persisted, so repeated attempts cannot grow the table); the attempt itself is
        // recorded for moderators by assessOutgoingMessage.
        const echo = {
          id: `blocked-edit:${exists.id}:${Date.now()}`,
          text: String(text),
          senderId: String(socket.userId),
          userId: String(socket.userId),
          roomId: exists.chatRoomId,
          status: 'blocked',
          ts: new Date().toISOString(),
        };
        io.to(`user_${socket.userId}`).emit('message', echo);
        io.to(`user_${socket.userId}`).emit('message:received', { ...echo, chatId: exists.chatRoomId, content: echo.text });
        return;
      }

      // User-block gate runs after moderation so an adult→minor edit is still recorded.
      // The blocked party sees the edit on their own sockets only; nothing is stored.
      // The blocker is dropped with no block-specific error. A lookup failure stores nothing.
      const editGate = await readPrivateChatBlock(String(socket.userId), exists.chatRoomId);
      if (editGate.error) {
        socket.emit('error', 'Could not send message');
        return;
      }
      if (editGate.blocked) {
        if (editGate.senderIsBlocked && String(exists.text) !== String(text)) {
          io.to(`user_${socket.userId}`).emit('messageUpdated', {
            id: messageId,
            text: String(text),
            isEdited: true,
            roomId: exists.chatRoomId,
          });
        }
        return;
      }

      // Keep the pre-edit text so editing cannot erase what a reporter/moderator needs to see.
      const editResult = await applyMessageEdit(prisma, exists, text);
      if (editResult === 'conflict') {
        socket.emit('error', 'Message changed, please try again');
        return;
      }
      if (editResult === 'unchanged') return;

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
    if (!messageId || !socket.userId) return;
    try {
      const exists = await prisma.message.findUnique({ where: { id: String(messageId) } });
      if (!exists) {
        console.warn(`deleteMessage: Message ${messageId} not found.`);
        return;
      }
      if (exists.userId !== String(socket.userId)) {
        socket.emit('error', 'Unauthorized');
        return;
      }
      if (!(await checkChatPermission(socket.userId, exists.chatRoomId))) return;

      if (!(await applyMessageDelete(prisma, exists))) {
        socket.emit('error', 'Could not delete message, please try again');
        return;
      }

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

// Lottery execution, pick-session draw/open, and game auto-completion are event-driven via
// gameScheduler (armed from write paths in gameService.js/pickSessionService.js, reloaded on
// boot by gameScheduler.loadAll()) instead of polling every 30-60s here.

// --- Weekly Series Rolling Generation ---
function nextWeeklyOccurrenceFrom(now, targetDay, hhmm) {
  const { parseJerusalemTimeToUTC } = require('./utils/timezone');
  const [hh, mm] = String(hhmm).split(':').map(n => parseInt(n, 10));
  
  const tz = 'Asia/Jerusalem';
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  
  const day = nowInTz.getDay();
  let addDays = (targetDay - day + 7) % 7;
  
  const candidateYear = nowInTz.getFullYear();
  const candidateMonth = nowInTz.getMonth();
  const candidateDay = nowInTz.getDate() + addDays;
  
  const targetDate = new Date(candidateYear, candidateMonth, candidateDay);
  const dateStr = targetDate.toISOString().split('T')[0];
  const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  
  let candidateUtc = parseJerusalemTimeToUTC(dateStr, timeStr);
  
  if (candidateUtc <= now) {
    const nextWeekDate = new Date(targetDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nwDateStr = nextWeekDate.toISOString().split('T')[0];
    candidateUtc = parseJerusalemTimeToUTC(nwDateStr, timeStr);
  }
  
  return candidateUtc;
}

const { resolveSeriesRegistrationOpensAt } = require('./utils/seriesRegistrationRule');

let seriesGenRunning = false;
// `shouldContinue` lets a deposed job leader stop between series/occurrences.
async function runWeeklySeriesGeneration({ shouldContinue = () => true } = {}) {
  if (seriesGenRunning || !shouldContinue()) return;
  seriesGenRunning = true;
  try {
    const now = new Date();
    // Only active WEEKLY series that have a fieldId
    const seriesList = await prisma.gameSeries.findMany({
      where: { isActive: true, type: 'WEEKLY', NOT: { fieldId: null } }
    });

    for (const s of seriesList) {
      if (!shouldContinue()) break;
      try {
        if (typeof s.dayOfWeek !== 'number' || !s.time || !s.fieldId) continue;

        // GameSeries.fieldId has no FK/cascade relation to Field (unlike Game.fieldId),
        // so a deleted field leaves the series pointing at nothing forever. Deactivate
        // it here instead of letting every future run fail the same Game.create().
        const field = await prisma.field.findUnique({ where: { id: s.fieldId }, select: { id: true } });
        if (!field) {
          await prisma.gameSeries.update({ where: { id: s.id }, data: { isActive: false } });
          console.warn(`Series ${s.id} references a deleted field (${s.fieldId}); deactivating.`);
          continue;
        }

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

        const pendingCreates = [];
        while (futureGames.length + pendingCreates.length < TARGET) {
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

          const regOpen = resolveSeriesRegistrationOpensAt(s, nextStart);

          pendingCreates.push({
            participantIds: participantsCreate.map((p) => p.userId),
            start: nextStart,
            data: {
              fieldId: s.fieldId,
              seriesId: s.id,
              start: nextStart,
              duration: Math.round(Number(s.duration) || 1),
              maxPlayers: Number(s.maxPlayers),
              price: s.price ?? 0,
              isOpenToJoin: true,
              // A friends-only group's games must stay friends-only (and follow its link policy).
              isFriendsOnly: !!s.isFriendsOnly,
              friendsOnlyLinkPolicy: s.friendsOnlyLinkPolicy || 'REQUEST_TO_JOIN',
              joinPolicy: s.joinPolicy || 'INSTANT',
              lotteryEnabled: false,
              organizerInLottery: false,
              description: '',
              organizerId: s.organizerId,
              participants: { create: participantsCreate },
              roles: { create: { userId: s.organizerId, role: 'ORGANIZER' } },
              sport: s.sport || 'SOCCER',
              registrationOpensAt: regOpen
            }
          });

          nextStart = new Date(nextStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        }

        if (pendingCreates.length) {
          const { createGroupChatForGame, isSeriesSlotConflict } = require('./services/gameService');
          // One transaction per occurrence (game + its group chat stay atomic). Game has a unique
          // (seriesId, start): if another job process already created this slot, the P2002 only
          // aborts that occurrence and the rest are still generated.
          let createdCount = 0;
          for (const occ of pendingCreates) {
            if (!shouldContinue()) break;
            try {
              const game = await prisma.$transaction(async (tx) => {
                const g = await tx.game.create({ data: occ.data });
                await createGroupChatForGame(tx, g.id, occ.participantIds);
                return g;
              }, { timeout: 30000, maxWait: 10000 });
              gameScheduler.resyncGame(game);
              createdCount += 1;
            } catch (occErr) {
              // Only the (seriesId, start) slot constraint means "already generated"; any other
              // unique violation is a real error and must surface.
              if (isSeriesSlotConflict(occErr)) {
                console.warn(`Series ${s.id} occurrence at ${occ.start.toISOString()} already exists; skipping.`);
                continue;
              }
              throw occErr;
            }
          }
          if (createdCount) console.log(`🗓️  Generated ${createdCount} weekly instances for series ${s.id}`);
        }
      } catch (seriesErr) {
        // Isolate failures per series so one bad series doesn't abort the whole batch.
        console.error(`Weekly series generation error for series ${s.id}:`, seriesErr);
      }
    }
  } catch (e) {
    console.error('Weekly series generation error:', e);
  } finally {
    seriesGenRunning = false;
  }
}


// 404 handler (must be after all routes, before error handler)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', requestId: req.requestId });
});

// Global Error handling middleware (Must be last before server start)
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  console.error(JSON.stringify({
    level: 'error',
    requestId,
    message: err.message,
    stack: err.stack,
  }));
  // Path only: query strings can carry search terms such as an email address.
  captureException(err, { requestId, path: String(req.originalUrl || '').split('?')[0], method: req.method });
  const payload = { error: 'Something went wrong!', requestId };
  if (process.env.NODE_ENV !== 'production') payload.message = err.message;
  res.status(500).json(payload);
});

// Graceful shutdown: rolling deploys must drain sockets (clients fail over to the other
// instance) and release anything cluster-visible (job leadership) instead of being cut off.
// Never registered under Jest.
const shutdownHooks = [];
let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] ${signal} received, draining...`);
  const force = setTimeout(() => {
    console.error('[SHUTDOWN] timed out, forcing exit');
    process.exit(1);
  }, 10000);
  if (force.unref) force.unref();
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { console.error(`[SHUTDOWN] ${name} failed:`, e && e.message); }
  };
  for (const [name, fn] of shutdownHooks) await step(name, fn);
  await step('socket.io', () => new Promise((resolve) => { io.close(() => resolve()); }));
  await step('socket adapter', () => socketAdapter.close());
  await step('redis bridge', async () => {
    for (const c of [redisSub, redisPub]) if (c) { try { await c.quit(); } catch { c.disconnect(); } }
  });
  await step('redis shared', () => closeSharedRedis());
  await step('prisma', () => prisma.$disconnect());
  console.log('[SHUTDOWN] done');
  process.exit(0);
}
// Graceful drain is on by default (Node as PID 1 otherwise ignores SIGTERM until the platform
// SIGKILLs it). GRACEFUL_SHUTDOWN=false restores the old behaviour.
const gracefulShutdownEnabled = process.env.GRACEFUL_SHUTDOWN !== 'false' && process.env.GRACEFUL_SHUTDOWN !== '0';
if (!process.env.JEST_WORKER_ID && gracefulShutdownEnabled) {
  process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
}

// --- Background jobs lifecycle (see services/jobsRuntime.js) -------------------------------
// io used by jobs when they must go over the bridge: publish so EVERY instance delivers to its
// own sockets, regardless of which instance happens to be the job runner.
function makeBridgeIo() {
  return createPublisherIo((msg) => {
    if (!redisPub) {
      console.warn('[WORKER] REDIS_URL is not set — live socket events will not reach the API');
      return;
    }
    return redisPub.publish(SOCKET_CHANNEL, JSON.stringify(msg));
  });
}

const jobsRuntime = createJobsRuntime({
  enabled: enableBackgroundSchedulers,
  httpEnabled: enableHttpServer,
  useLeaderLock,
  gameScheduler,
  prisma,
  notificationService,
  startCleanupWorker,
  stopCleanupWorker,
  runWeeklySeriesGeneration,
  runTournamentReminders: ({ io: jobIo, shouldContinue }) => require('./services/tournamentReminders')
    .runReminderSweep({ prisma, notificationService, io: jobIo, shouldContinue }),
  createLeaderLock,
  getRedis,
  adapterEnabled: () => socketAdapter.enabled,
  makeBridgeIo,
  addShutdownHook: (hook) => shutdownHooks.push(hook),
  ttlMs: Number(process.env.JOBS_LEADER_TTL_MS) || 30000,
});

const startJobs = (jobIo) => jobsRuntime.start(jobIo);

async function startServer() {
  await initializeDataFiles();

  if (!enableHttpServer) {
    const jobIo = makeBridgeIo();
    await startJobs(jobIo);
    console.log('[WORKER] background jobs running (HTTP bind skipped)');
    return null;
  }

  return new Promise((resolve) => {
    server.listen(PORT, '0.0.0.0', async () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔌 Socket.IO ready on /api/socket (CORS allowlist: ${JSON.stringify(allowedOrigins)}, permissive: ${corsPermissive})`);
      await startJobs(io);
      resolve(server);
    });
  });
}

if (!process.env.JEST_WORKER_ID) {
  startServer().catch((err) => {
    console.error('[FATAL] server startup failed:', err);
    process.exit(1);
  });
}

module.exports = { app, server, io, socketAdapter, startServer, socketAuthMiddleware, runWeeklySeriesGeneration };
