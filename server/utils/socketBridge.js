const SOCKET_CHANNEL = 'joinup:socket_events';
// Lets a process without an enabled gameScheduler (e.g. the web API when split from the
// dedicated jobs worker) forward resync/review-queue signals to whichever process runs it.
const SCHEDULER_CHANNEL = 'joinup:scheduler_events';

function createPublisherIo(publishFn) {
  return {
    to(room) {
      return {
        emit(event, payload) {
          Promise.resolve(publishFn({
            rooms: [String(room)],
            event,
            payload,
            broadcast: false,
          })).catch((err) => console.error('[socketBridge] publish failed', err));
        },
      };
    },
    emit(event, payload) {
      Promise.resolve(publishFn({
        rooms: [],
        event,
        payload,
        broadcast: true,
      })).catch((err) => console.error('[socketBridge] publish failed', err));
    },
  };
}

// Apply a bridged event on THIS node's sockets only. Every HTTP instance subscribes to the
// bridge channel, so with the Redis Socket.IO adapter enabled a plain `io.emit` would be
// re-published to the whole cluster by each of the N subscribers (N-fold duplicates).
// `io.local` scopes the emit to local sockets; on the default adapter it equals `io`.
function localTarget(io) {
  return (io && io.local) || io;
}

function applySocketEvent(io, msg) {
  if (!io || !msg || !msg.event) return;
  const target = localTarget(io);
  if (msg.broadcast) {
    target.emit(msg.event, msg.payload);
    return;
  }
  for (const room of msg.rooms || []) {
    target.to(String(room)).emit(msg.event, msg.payload);
  }
}

module.exports = { SOCKET_CHANNEL, SCHEDULER_CHANNEL, createPublisherIo, applySocketEvent, localTarget };
