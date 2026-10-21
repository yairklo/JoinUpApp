# WebSockets, Push Notifications & Background Workers

## 1. FIREBASE PRIVATE KEY DOUBLE-ESCAPING
- **The Pitfall**: Environments like Coolify re-escape PEM strings, turning `\n` into double-escaped `\\n` sequences in server memory, crashing Firebase signature checks.
- **Actionable Rule**: Always normalize incoming environment keys with the following load-bearing regex quantifier to strip out cascading backslashes:
```javascript
privateKey: process.env.FIREBASE_PRIVATE_KEY 
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\+n/g, '\n') 
  : undefined
```

## 2. CHAT PARTICIPANT CONSTRAINTS & CATCH-AND-IGNORE
- **The Pitfall**: Concurrent operations or double-taps attempting to register a user into a chat room can violate the @@unique([userId, chatId]) constraint and throw a P2002 exception.
- **Actionable Rule**: Every direct `prisma.chatParticipant.create()` operation must be wrapped in a localized try/catch block that silently treats a P2002 error as a success state (since the user is already successfully in the room):
```javascript
try {
  await prisma.chatParticipant.create({ data: { userId, chatId } });
} catch (e) {
  if (e.code !== 'P2002') throw e; // Re-throw real structural issues
}
```

## 3. CLIENT-SIDE REFRESH LOOPS & SOCKET CLEANUP (React / React Native)
- **Unsubscribe Rule**: Every invocation of `SocketManager.on(...)` inside a component or hook must capture and execute the returned un-subscription cleanup function when the effect unmounts:
```javascript
useEffect(() => {
  const unsub = SocketManager.on('chat:sync', handleIncoming);
  return () => unsub(); // Compulsory cleanup to prevent severe memory leaks
}, [user?.id]);
```
```
- **Clerk Ref-Freezing Pattern**: To prevent infinite data-fetching and re-rendering loops caused by unstable function identities (such as Clerk's `getToken`), freeze the function reference inside a mutable `useRef` and rely on stable primitive states (`isLoaded`, `userId`) in effect dependency arrays:
```javascript
const getTokenRef = useRef(getToken);
useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

// Trigger effects ONLY on primitive changes
useEffect(() => {
  if (isLoaded && userId) fetchNotifications();
}, [isLoaded, userId]);
```

## 4. RUNNING MORE THAN ONE API INSTANCE

All of this is opt-in by env flag; with no flags set a single instance behaves exactly as before.
A second instance needs only `REDIS_URL` + the flags below (and a proxy with sticky sessions).

| Flag | Effect | Default |
| :--- | :--- | :--- |
| `REDIS_URL` | Redis for everything below. Self-hosted `redis:7-alpine` is fine; no persistence needed. | unset |
| `SOCKET_ADAPTER=redis` | `@socket.io/redis-adapter` (classic pub/sub): `io.to(room).emit()` reaches sockets on every instance. Code: `server/socket/adapter.js`. | off |
| `RATE_LIMIT_STORE=redis` | HTTP rate-limit counters shared across instances (`middleware/rateLimitStore.js`). | `memory` |
| `CHAT_RATE_STORE=redis` | Chat send limiter (10 msgs / 10 s) shared across instances. | `memory` |
| `CHAT_DEDUPE_STORE=redis` | tempId idempotency shared across instances (retry after failover is not stored twice). | `memory` |
| `JOBS_LEADER_LOCK=redis` | Background jobs run only on the Redis lock holder (see below). | off |
| `JOBS_LEADER_TTL_MS` | Leader lock TTL (renew every TTL/3). | `30000` |
| `RUN_BACKGROUND_JOBS=false` | This process never hosts jobs (opt-out). | on |
| `GRACEFUL_SHUTDOWN=false` | Disable the SIGTERM/SIGINT drain (on by default: release the job lock, close sockets/Redis, disconnect Prisma, exit within 10 s). | on |

The shared tempId in-flight marker lives 25 s (just above the 20 s send timeout) so a retry is not
ignored for minutes if an instance dies mid-send; only the stored echo keeps 5 minutes. Presence and
dedupe lookups are local-first with a circuit breaker (`utils/circuitBreaker.js`).

**Redis down is never fatal.** The adapter delivers locally first and drops only the cross-instance
copy; limiters, dedupe and presence fall back to per-instance memory / the local socket view;
`/api/health` stays dependency-free. Clients refetch from Postgres on reconnect.

**Rules for socket code**
- Never read `io.sockets.adapter.rooms` or `io.sockets.sockets` to decide something about *another
  user* (online? delivered?): they only contain this node's sockets. Use `utils/socketPresence`
  (`isUserOnline`, `hasOtherUserInRoom`, cluster-wide via `fetchSockets()` with a 300 ms timeout and
  local fallback). Per-socket data that other nodes need goes in `socket.data` (`socket.data.userId`
  is set by `socketAuthMiddleware`).
- Events that arrive from Redis for *every* instance to apply (`joinup:socket_events` from `worker.js`,
  `moderation_events`) must be applied with `io.local` (`utils/socketBridge.localTarget`). A plain
  `io.to(room).emit` there is re-published by the adapter and every client gets N copies.
- Engine.IO long-polling needs all requests of a session on one instance. Web is websocket-first;
  mobile is polling-first, so the proxy must use cookie stickiness (Caddy `lb_policy cookie`).
  A Redis adapter does NOT replace stickiness.
- Rolling deploys: `SIGTERM` drains sockets, releases the job lock and disconnects Prisma
  (`gracefulShutdown` in `index.js`); restart one instance at a time.

## 5. BACKGROUND JOBS: ONE RUNNER, ELECTED BY A REDIS LOCK

In-process `gameScheduler` timers, weekly series generation, the review queue and the cleanup cron
must run in exactly one process. They only start when `RUN_BACKGROUND_JOBS` is not `false`/`0` (and
not under Jest).

- **Without `JOBS_LEADER_LOCK`** (default): every process with jobs enabled runs them, so extra API
  instances MUST set `RUN_BACKGROUND_JOBS=false`. A dedicated `npm run worker` (`worker.js`,
  `RUN_HTTP_SERVER=false`) still works: it publishes socket events on `joinup:socket_events` and the
  API instances apply them with `io.local`.
- **With `JOBS_LEADER_LOCK=redis`** (`services/leaderLock.js`): any API instance and `worker.js` may
  have jobs enabled; only the lock holder runs them. Key `joinup:jobs:leader`, value = unique instance
  id, `SET NX PX`, compare-and-renew (Lua) every TTL/3, compare-and-delete on shutdown. On acquire the
  holder runs `gameScheduler.init + loadAll`, cleanup cron, series generation and a review-queue
  drain; on loss/shutdown it clears every scheduler timer and stops the crons (`stopJobsNow`). Standby
  instances keep retrying. Overdue timers fire immediately after a hand-over, so a failover only delays
  jobs by up to ~TTL (crash) or one retry interval (graceful).
- **Signals**: `gameScheduler.resyncGame()` / `triggerReviewQueue()` on a non-leader publish on
  `joinup:scheduler_events`; every job-capable instance subscribes and `gameScheduler.handleSignal`
  acts only on the leader (a standby must never re-publish: that would loop).
- **Lease enforcement**: the lease is measured from the moment a renew/acquire was *sent* (minus TTL/6
  margin) and a dedicated timer demotes the leader exactly at the deadline, independent of the renew
  tick. Scheduler timers, the review queue and series generation also consult `lock.isLeader()` right
  before acting (`gameScheduler.setRunGuard`), so a frozen process waking up late runs nothing. A
  timed-out acquire whose reply was lost is recognised on the next tick (compare-and-renew). The
  lifecycle lives in `services/jobsRuntime.js` (tested with fakes and with two runtimes on real Redis).
- **Fail-safe policy**: no `REDIS_URL` => the lock cannot work, jobs run directly (single-instance
  behaviour, warning logged). `REDIS_URL` set but Redis unreachable => a standby does NOT run jobs
  (delay instead of duplicates); a leader keeps running until `lastRenew + TTL - TTL/6`, then stops
  itself before its key can be taken. Emergency bypass: unset `JOBS_LEADER_LOCK` (back to the
  one-runner-by-config rule above).
- **Defence in depth** (a stale timer or a lock-loss overlap must be harmless): `_runLottery`,
  `_runPickDraw`, `_runPickOpen` re-read the row and skip when the due time is still in the future;
  claims stay `updateMany` on sentinel fields; the review queue resolves a row with a status
  compare-and-set (only the winner deletes the message / applies the -20 reputation), runs one at a
  time per process and aborts when leadership is lost; weekly series generation relies on the
  `Game(seriesId, start)` unique constraint and stops between occurrences when deposed.
