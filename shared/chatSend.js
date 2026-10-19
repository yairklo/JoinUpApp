// Pure helpers for the optimistic-send lifecycle of chat messages, shared by web and mobile.
// Statuses: pending (optimistic, 1 tick) -> sent/delivered (server confirmed, 2 ticks) -> read (2 blue).
// failed = send error (retry/discard); blocked = moderation block (no retry); rejected = removed.

const SEND_TIMEOUT_MS = 15000;

const sameId = (a, b) => String(a) === String(b);

/** Which tick the sender's bubble shows: 'single' | 'double' | 'read' | 'error' | 'none'. */
function messageTickKind(status) {
  switch (status) {
    case 'pending': return 'single';
    case 'sent':
    case 'delivered': return 'double';
    case 'read': return 'read';
    case 'failed': return 'error';
    default: return 'none'; // blocked / rejected / unknown: never imply delivery
  }
}

/** pending -> failed (only if still pending: a late echo or a block must win). */
function markFailed(messages, id, retryable = true) {
  return messages.map((m) => (sameId(m.id, id) && m.status === 'pending' ? { ...m, status: 'failed', retryable } : m));
}

/** failed -> pending for a retry. Returns the same array if nothing is retryable. */
function markPending(messages, id) {
  return messages.map((m) => (sameId(m.id, id) && m.status === 'failed' && m.retryable !== false ? { ...m, status: 'pending' } : m));
}

function discardFailed(messages, id) {
  return messages.filter((m) => !(sameId(m.id, id) && m.status === 'failed'));
}

/** A server-wide status update (delivered/read) must not overwrite unconfirmed/failed/blocked messages. */
function applyStatusUpdate(messages, myUserId, status) {
  return messages.map((m) => (
    m.userId === myUserId && !['read', 'pending', 'failed', 'blocked'].includes(m.status) ? { ...m, status } : m
  ));
}

module.exports = { SEND_TIMEOUT_MS, messageTickKind, markFailed, markPending, discardFailed, applyStatusUpdate };
