/**
 * Per-socket "is this chat really on screen" tracking.
 *
 * Web clients report `chatView { roomId, visible }` whenever a chat becomes visible/hidden
 * (minimized widget, background tab, unmount). Once a socket has reported at least once it is
 * "tracked" and its `markAsRead` only counts for rooms it last reported visible. Sockets that
 * never report (the mobile app, older web builds) keep the legacy behaviour so nothing breaks.
 */
function setChatView(socketData, roomId, visible) {
  if (!socketData || !roomId) return;
  if (!socketData.chatViewTracked) {
    socketData.chatViewTracked = true;
    socketData.visibleChatRooms = new Set();
  }
  const id = String(roomId);
  if (visible) socketData.visibleChatRooms.add(id);
  else socketData.visibleChatRooms.delete(id);
}

function canSocketMarkRead(socketData, roomId) {
  if (!socketData || !socketData.chatViewTracked) return true;
  return socketData.visibleChatRooms.has(String(roomId));
}

module.exports = { setChatView, canSocketMarkRead };
