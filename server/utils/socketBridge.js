const SOCKET_CHANNEL = 'joinup:socket_events';

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

function applySocketEvent(io, msg) {
  if (!io || !msg || !msg.event) return;
  if (msg.broadcast) {
    io.emit(msg.event, msg.payload);
    return;
  }
  for (const room of msg.rooms || []) {
    io.to(String(room)).emit(msg.event, msg.payload);
  }
}

module.exports = { SOCKET_CHANNEL, createPublisherIo, applySocketEvent };
