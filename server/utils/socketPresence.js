/**
 * Cluster-aware presence helpers. `io.sockets.adapter.rooms` / `io.sockets.sockets` only know
 * THIS node's sockets, so with several API instances they silently under-report. These helpers
 * use `fetchSockets()` (cluster-wide when the Redis adapter is attached, local otherwise) with a
 * short timeout and fall back to the local view so a slow/down Redis can never stall the send path.
 */

const DEFAULT_TIMEOUT_MS = 300;

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

async function fetchRoomSockets(io, room, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      io.in(room).fetchSockets(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fetchSockets timeout')), timeoutMs); }),
    ]);
  } catch (err) {
    return localRoomSockets(io, room);
  } finally {
    clearTimeout(timer);
  }
}

/** Online = at least one socket (any instance) in the user's personal room. */
async function isUserOnline(io, userId, timeoutMs) {
  const sockets = await fetchRoomSockets(io, `user_${userId}`, timeoutMs);
  return sockets.length > 0;
}

/** True when a socket of a user OTHER than `userId` is in the room (the sender's own tabs don't count). */
async function hasOtherUserInRoom(io, roomId, userId, timeoutMs) {
  const sockets = await fetchRoomSockets(io, String(roomId), timeoutMs);
  return sockets.some((s) => String(s.data?.userId) !== String(userId));
}

module.exports = { fetchRoomSockets, isUserOnline, hasOtherUserInRoom, localRoomSockets };
