/**
 * Chat send-path safety: message validation, per-user send rate limit, and the
 * minor-protection moderation policy shared by the socket and REST write paths
 * (including edits).
 *
 * Policy (teens swear; that is not what we moderate):
 * - Minor senders are never filtered, in any chat. Reports are the safety net.
 * - Group / game chats have no lexicon filter, even with minors present.
 * - Private adult→minor: a short lexicon of severe sexual slurs is blocked.
 * - AI moderation runs only when the sender is an adult and at least one
 *   recipient is a known minor (private or group), and only for messages that
 *   trip the cheap deterministic gate (moderationGate.js).
 * - Unknown ages stay "adult", matching getDefaultPrivacyForAge.
 * - If AI says unsafe -> blocked.
 * - If AI could not actually check a gated message (error, AI down, rate limit)
 *   -> blocked only when a minor recipient is NOT a confirmed friend of the
 *   sender; otherwise delivered.
 */
const { prisma } = require('../lib/prisma');
const { getAgeInJerusalem } = require('../utils/privacy');
const { containsSevereSlur } = require('./profanityFilter');
const { needsAiReview } = require('./moderationGate');

const MAX_MESSAGE_LENGTH = 2000;
const SEND_RATE_WINDOW_MS = 10_000;
const SEND_RATE_MAX = 10;

/** @returns {string|null} error code, or null when the text is acceptable */
function validateMessageText(text) {
  if (typeof text !== 'string' || !text.trim()) return 'EMPTY_MESSAGE';
  if (text.length > MAX_MESSAGE_LENGTH) return 'MESSAGE_TOO_LONG';
  return null;
}

/** In-memory sliding-window limiter keyed by user id (per API process). */
function createSendRateLimiter({ windowMs = SEND_RATE_WINDOW_MS, max = SEND_RATE_MAX } = {}) {
  const hits = new Map();

  function sweep(now) {
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] >= windowMs) hits.delete(key);
    }
  }

  return {
    allow(userId, now = Date.now()) {
      const key = String(userId);
      const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (times.length >= max) {
        hits.set(key, times);
        return false;
      }
      times.push(now);
      hits.set(key, times);
      if (hits.size > 5000) sweep(now);
      return true;
    },
  };
}

/**
 * Everyone in the room except the sender, plus whether it is a group chat
 * (game chat, or a chat room that is not a 1:1).
 */
async function resolveRoom(roomId, senderId) {
  const room = String(roomId);
  const sender = String(senderId);

  const chatRoom = await prisma.chatRoom.findUnique({
    where: { id: room },
    include: { participants: true },
  });
  if (chatRoom) {
    const recipientIds = chatRoom.participants.map((p) => p.userId).filter((id) => id !== sender);
    const isGroup = (chatRoom.type && chatRoom.type !== 'PRIVATE') || chatRoom.participants.length > 2;
    return { recipientIds, isGroup };
  }

  // Web's legacy "private_ID1_ID2" room ids
  if (room.startsWith('private_')) {
    const otherId = room.replace('private_', '').split('_').find((id) => id !== sender);
    return { recipientIds: otherId ? [otherId] : [], isGroup: false };
  }

  // Group chat whose room id is the game id
  const participations = await prisma.participation.findMany({
    where: { gameId: room, status: 'CONFIRMED', userId: { not: sender } },
    select: { userId: true },
  });
  return { recipientIds: participations.map((p) => p.userId), isGroup: true };
}

/** Everyone in the room except the sender. */
async function resolveRecipientIds(roomId, senderId) {
  return (await resolveRoom(roomId, senderId)).recipientIds;
}

/** Known-minor recipients, and which of them are not confirmed friends of the sender. */
async function getMinorRecipients(senderId, recipientIds) {
  const empty = { minorIds: [], nonFriendMinorIds: [], youngestAge: null };
  if (!recipientIds.length) return empty;

  const users = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, birthDate: true },
  });
  let youngestAge = null;
  const minorIds = [];
  for (const u of users) {
    const age = getAgeInJerusalem(u.birthDate);
    if (age !== null && age < 18) {
      minorIds.push(u.id);
      if (youngestAge === null || age < youngestAge) youngestAge = age;
    }
  }
  if (!minorIds.length) return empty;

  const sender = String(senderId);
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { userAId: sender, userBId: { in: minorIds } },
        { userBId: sender, userAId: { in: minorIds } },
      ],
    },
    select: { userAId: true, userBId: true },
  });
  const friendIds = new Set(friendships.map((f) => (f.userAId === sender ? f.userBId : f.userAId)));

  return { minorIds, nonFriendMinorIds: minorIds.filter((id) => !friendIds.has(id)), youngestAge };
}

/** Moderator trail for a blocked adult→minor attempt (never throws). */
async function recordBlockedAttempt({ text, senderId, roomId, senderAge, youngestAge, reason, onFlagged }) {
  try {
    await prisma.flaggedMessage.create({
      data: {
        content: text,
        userId: senderId,
        status: 'PENDING_REVIEW',
        resolution: null,
        aiTriggers: {
          source: 'blocked_attempt',
          reason,
          roomId: String(roomId),
          senderAge,
          receiverAge: youngestAge,
          chatMode: 'ADULT_TO_MINOR',
        },
      },
    });
    if (onFlagged) onFlagged();
  } catch (dbError) {
    console.error('[MODERATION] Failed to record blocked attempt:', dbError.message);
  }
}

/**
 * Decides whether a message is delivered or blocked.
 * @returns {Promise<{ status: 'sent'|'blocked', recipientIds: string[] }>}
 * Throws when recipients/ages cannot be determined — callers must not deliver then.
 */
async function assessOutgoingMessage({ moderator, sender, roomId, text, onFlagged }) {
  const senderId = String(sender.id);
  const { recipientIds, isGroup } = await resolveRoom(roomId, senderId);
  const { minorIds, nonFriendMinorIds, youngestAge } = await getMinorRecipients(senderId, recipientIds);
  const senderAge = getAgeInJerusalem(sender.birthDate);
  const senderIsMinor = senderAge !== null && senderAge < 18;

  // Only an adult writing to a minor is moderated at all.
  if (senderIsMinor || !minorIds.length) return { status: 'sent', recipientIds };

  // Private adult→minor: severe sexual slurs only. Groups rely on AI + reports.
  if (!isGroup && containsSevereSlur(text)) {
    console.log(`[MODERATION] Blocked slur in room ${roomId}`);
    await recordBlockedAttempt({ text, senderId, roomId, senderAge, youngestAge, reason: 'severe_slur', onFlagged });
    return { status: 'blocked', recipientIds, reason: 'profanity' };
  }

  // Ordinary messages never reach the (paid) AI.
  if (!needsAiReview(text)) return { status: 'sent', recipientIds };

  let modResult = null;
  try {
    modResult = await moderator.checkMessage(text, [], {}, {
      userId: senderId,
      userAge: senderAge,
      receiverAge: youngestAge,
      userGender: sender.gender,
    });
  } catch (e) {
    console.error('[MODERATION] Service error:', e.message);
  }

  const unverified = !modResult || !!modResult.unverified;
  let status = 'sent';
  if (modResult && !modResult.isSafe) status = 'blocked';
  else if (unverified && nonFriendMinorIds.length) status = 'blocked';

  if (status === 'blocked') {
    console.log(`[MODERATION] Blocked message in room ${roomId} (${unverified ? 'moderation unavailable' : 'unsafe'})`);
  }

  if (status === 'blocked' && !modResult?.reviewNeeded) {
    // reviewNeeded already writes a row below; otherwise leave a trail so repeated
    // attempts by an adult towards a minor are visible to moderators.
    await recordBlockedAttempt({
      text, senderId, roomId, senderAge, youngestAge, onFlagged,
      reason: unverified ? 'blocked_unverified' : 'blocked_unsafe',
    });
  }

  if (modResult?.reviewNeeded) {
    try {
      await prisma.flaggedMessage.create({
        data: {
          content: text,
          userId: senderId,
          status: 'PENDING_REVIEW',
          resolution: null,
          aiTriggers: {
            reason: modResult.reason || 'Unknown',
            source: modResult.source || 'moderator',
            senderAge,
            receiverAge: youngestAge,
            chatMode: senderAge !== null && senderAge >= 18 ? 'ADULT_TO_MINOR' : 'OTHER',
            retryDelay: modResult.retryDelay || null,
            retryAfter: modResult.retryDelay ? new Date(Date.now() + modResult.retryDelay * 1000).toISOString() : null,
          },
        },
      });
      if (onFlagged) onFlagged();
    } catch (dbError) {
      console.error('[MODERATION] Failed to save flagged message:', dbError.message);
    }
  }

  return { status, recipientIds };
}

// One limiter for both write paths (socket + REST) so they share a user's budget.
const sendRateLimiter = createSendRateLimiter();

module.exports = {
  MAX_MESSAGE_LENGTH,
  sendRateLimiter,
  validateMessageText,
  createSendRateLimiter,
  resolveRecipientIds,
  getMinorRecipients,
  assessOutgoingMessage,
};
