/**
 * Cluster-aware presence helpers. `io.sockets.adapter.rooms` / `io.sockets.sockets` only know
 * THIS node's sockets, so with several API instances they silently under-report. These helpers
 * answer from the local view first (free, and decisive when it already says "yes") and only ask
 * the cluster (`fetchSockets()`, via the Redis adapter) when the local view cannot decide.
 *
 * Unknown is NOT offline. When the cluster answer is unavailable (soft timeout, adapter error,
 * open breaker) the user may well be connected on another instance, so the helpers answer
 * "maybe online / maybe present": callers then never emit a false `presence:update offline` and
 * never downgrade a delivered tick. The cost of the opposite mistake (briefly showing someone
 * online) is much smaller than telling a connected user they are offline.
 *
 * Breaker semantics: a reply that is merely slower than the soft timeout (`timeoutMs`, 300 ms)
 * returns "unknown" for that call but is NOT a failure; the request keeps running and, if it later
 * succeeds, it counts as a success. Only real errors and the adapter's own hard request timeout
 * (a rejected fetchSockets) count toward opening the breaker.
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

/** @returns {Promise<{known: boolean, sockets: object[]}>} cluster-wide sockets, or known:false. */
async function queryCluster(io, room, timeoutMs = DEFAULT_TIMEOUT_MS, { exceptRoom } = {}) {
  if (!breaker.allow()) return { known: false, sockets: [] };
  let timer;
  try {
    let target = io.in(room);
    if (exceptRoom && typeof target.except === 'function') target = target.except(exceptRoom);
    const request = Promise.resolve().then(() => target.fetchSockets());
    // Observe the real outcome even if we stop waiting: late success clears the failure count,
    // a rejection (real error / adapter hard timeout) counts toward the breaker.
    request.then(() => breaker.success(), () => breaker.failure());
    const sockets = await Promise.race([
      request,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (sockets === null) return { known: false, sockets: [] };
    return { known: true, sockets };
  } catch (_) {
    return { known: false, sockets: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** 'online' | 'offline' | 'unknown' (user's personal room, any instance). */
async function getUserPresence(io, userId, timeoutMs) {
  const room = `user_${userId}`;
  if (localRoomSockets(io, room).length > 0) return 'online'; // decisive locally, no cluster call
  const { known, sockets } = await queryCluster(io, room, timeoutMs);
  if (!known) return 'unknown';
  return sockets.length > 0 ? 'online' : 'offline';
}

/** Online unless we KNOW the user has no socket anywhere (unknown counts as maybe online). */
async function isUserOnline(io, userId, timeoutMs) {
  return (await getUserPresence(io, userId, timeoutMs)) !== 'offline';
}

/**
 * True when a socket of a user OTHER than `userId` is (or may be) in the room; the sender's own
 * tabs don't count. Local sockets first; the cluster query then excludes the sender's personal
 * room so it only transfers other users' sockets. Unknown => true (maybe present).
 */
async function hasOtherUserInRoom(io, roomId, userId, timeoutMs) {
  const room = String(roomId);
  const isOther = (s) => String(s.data?.userId) !== String(userId);
  if (localRoomSockets(io, room).some(isOther)) return true;
  const { known, sockets } = await queryCluster(io, room, timeoutMs, { exceptRoom: `user_${userId}` });
  if (!known) return true;
  return sockets.some(isOther);
}

/** Test hook: forget breaker state. */
function resetPresenceBreaker() {
  breaker.reset();
}

module.exports = {
  queryCluster, getUserPresence, isUserOnline, hasOtherUserInRoom, localRoomSockets,
  resetPresenceBreaker, _breaker: breaker,
};
