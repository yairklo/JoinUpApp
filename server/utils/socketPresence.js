/**
 * Cluster-aware presence helpers. `io.sockets.adapter.rooms` / `io.sockets.sockets` only know
 * THIS node's sockets, so with several API instances they silently under-report. These helpers
 * answer from the local view first (free, and decisive when it already says "yes") and only ask
 * the cluster (`fetchSockets()`, via the Redis adapter) when the local view cannot decide. The
 * cluster call has a short timeout and a circuit breaker, so a slow/down Redis costs at most one
 * timeout per breaker window instead of one per chat message, and falls back to the local view.
 */
const { createBreaker } = require('./circuitBreaker');

const DEFAULT_TIMEOUT_MS = 300;
const breaker = createBreaker({ threshold: 3, openMs: 5000 });

function localRoomSockets(io, room) {
  const ids = io.sockets && io.sockets.adapter && io.sockets.adapter.rooms.get(room);
  if (!ids) return [];
  const out = [];
  for (const sid of ids) {
    const s = io.sockets.sockets.get(sid);
    if (s) out.push({ id: sid, data: { userId: s.data?.userId ?? s.userId } });
  }
  return out;
}

/** Cluster-wide sockets of a room, or the local view on timeout/error/open breaker. */
async function fetchRoomSockets(io, room, timeoutMs = DEFAULT_TIMEOUT_MS, { exceptRoom } = {}) {
  if (!breaker.allow()) return localRoomSockets(io, room);
  let timer;
  try {
    let op = io.in(room);
    if (exceptRoom && typeof op.except === 'function') op = op.except(exceptRoom);
    const sockets = await Promise.race([
      op.fetchSockets(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fetchSockets timeout')), timeoutMs); }),
    ]);
    breaker.success();
    return sockets;
  } catch (err) {
    breaker.failure();
    return localRoomSockets(io, room);
  } finally {
    clearTimeout(timer);
  }
}

/** Online = at least one socket (any instance) in the user's personal room. */
async function isUserOnline(io, userId, timeoutMs) {
  const room = `user_${userId}`;
  if (localRoomSockets(io, room).length > 0) return true; // decisive locally, no cluster call
  return (await fetchRoomSockets(io, room, timeoutMs)).length > 0;
}

/**
 * True when a socket of a user OTHER than `userId` is in the room (the sender's own tabs don't
 * count). Local sockets are checked first; the cluster query then excludes the sender's personal
 * room so it only transfers other users' sockets.
 */
async function hasOtherUserInRoom(io, roomId, userId, timeoutMs) {
  const room = String(roomId);
  const isOther = (s) => String(s.data?.userId) !== String(userId);
  if (localRoomSockets(io, room).some(isOther)) return true;
  const remote = await fetchRoomSockets(io, room, timeoutMs, { exceptRoom: `user_${userId}` });
  return remote.some(isOther);
}

/** Test hook: forget breaker state. */
function resetPresenceBreaker() {
  breaker.reset();
}

module.exports = { fetchRoomSockets, isUserOnline, hasOtherUserInRoom, localRoomSockets, resetPresenceBreaker, _breaker: breaker };
