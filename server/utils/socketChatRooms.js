/**
 * Live Socket.IO membership for chats and accounts.
 *
 * Chat handlers join `String(chatId)` (see joinRoom / joinChats). Every signed-in
 * socket also sits in `user_${userId}`. Removing a chat membership or closing an
 * account has to update those rooms; otherwise the socket keeps the room until
 * it reconnects.
 */

function leaveUserChatRoom(io, userId, chatId) {
  if (!io || userId == null || chatId == null) return;
  const uid = String(userId);
  const room = String(chatId);
  if (!uid || !room) return;
  try {
    const target = io.in(`user_${uid}`);
    if (target && typeof target.socketsLeave === 'function') target.socketsLeave(room);
  } catch (e) {
    console.error('[socket] leave chat room failed:', e && e.message);
  }
}

/** Drop every listed membership. Rows are `{ userId, chatId }` captured before the delete. */
function leaveChatMemberships(io, memberships) {
  if (!io || !Array.isArray(memberships)) return;
  for (const row of memberships) {
    if (!row) continue;
    leaveUserChatRoom(io, row.userId, row.chatId);
  }
}

/** Close every live socket for this account. `true` closes the underlying connection. */
function disconnectUserSockets(io, userId) {
  if (!io || userId == null) return;
  const uid = String(userId);
  if (!uid) return;
  try {
    const target = io.in(`user_${uid}`);
    if (target && typeof target.disconnectSockets === 'function') target.disconnectSockets(true);
  } catch (e) {
    console.error('[socket] disconnect user failed:', e && e.message);
  }
}

module.exports = { leaveUserChatRoom, leaveChatMemberships, disconnectUserSockets };
