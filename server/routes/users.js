const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken, attachOptionalUser, invalidateAccountState } = require('../utils/auth');
const { NotificationService } = require('../services/notificationService');
const { getCounters, broadcastCounters } = require('../services/counterService');
const {
  VALID_LEVELS,
  resolvePrivacyLevel,
  getAgeDefaults,
  areConfirmedFriends,
  canViewSection,
  canRequestFriendship,
  isKnownMinor,
} = require('../utils/privacy');
const {
  isGameRatingEligible,
  isConfirmedParticipant,
  getUserRatingSummary,
  validateScore,
} = require('../utils/ratings');
const { safeUpsertUserFromAuth } = require('../utils/userSync');
const { notificationName, publicDisplayName } = require('../utils/publicName');
const {
  MIN_AGE,
  ADULT_AGE,
  LEGAL_VERSION,
  AGE_GATE_STATUS,
  getAgeInJerusalem,
  getAgeGateStatus,
  isPlausibleBirthDate,
} = require('../shared/ageGate');
const { createImageUpload, handleSingleUpload, absoluteUrlFor, deleteUploadedFile, isManagedUploadUrl } = require('../middleware/upload');
const router = express.Router();
const userImageUpload = createImageUpload('users');
const notificationService = new NotificationService(prisma);

// Shared constants
const { SPORT_KEYS } = require('../utils/sports');
const { sanitizeFreeText } = require('../utils/sanitize');
const { isBlockedEitherWay, getBlockedEitherWayIds, getBlockedByMe } = require('../utils/blocks');
const { revokePresenceSubscriptions } = require('../utils/presenceAuth');
const crypto = require('crypto');

// After a decline the same requester must wait before asking the same person again, so a declined
// request cannot be re-sent (and re-notified) over and over. The person who declined can always ask.
const DECLINED_RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Shown wherever a deleted account is still referenced (organised games, chat history).
const DELETED_USER_NAME = 'משתמש שנמחק';
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 60;
// Path segments that live next to /:id in this router; they must never be read as a user id.
const RESERVED_USER_IDS = new Set(['friends', 'me', 'search', 'sports', 'notifications', 'requests', 'profile', 'blocks']);

// Helper to ensure sports exist
async function ensureSportsSeeded() {
  const count = await prisma.sport.count();
  if (count === 0) {
    console.log('Seeding initial sports...');
    for (const name of SPORT_KEYS) {
      await prisma.sport.create({ data: { id: name, name } });
    }
  }
}

// Get all available sports (and seed if missing)
router.get('/sports', async (req, res) => {
  try {
    await ensureSportsSeeded();
    const sports = await prisma.sport.findMany();
    res.json(sports);
  } catch (e) {
    console.error('Get sports error:', e);
    res.status(500).json({ error: 'Failed to fetch sports' });
  }
});

// Search users/players
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const loggedInUserId = req.user.id;
    console.log(`[Backend User Search] 🔍 Query length: ${q.length}, Logged-in user: "${loggedInUserId}"`);

    if (!q) {
      console.log('[Backend User Search] ⚠️ Empty query string. Returning early.');
      return res.json([]);
    }

    // Birth date stays server-side: it only decides whether the city is shown.
    const hiddenUserIds = await getBlockedEitherWayIds(loggedInUserId);
    const matchingUsers = await prisma.user.findMany({
      where: {
        AND: [
          { id: { notIn: [loggedInUserId, ...hiddenUserIds] } },
          { deletedAt: null },
          {
            // Public display field only: matching on email would let a query confirm
            // (and, by prefix, enumerate) other people's addresses.
            name: { contains: q, mode: 'insensitive' }
          },
          {
            OR: [
              { email: null },
              { NOT: { email: { contains: '@mock.joinup.com' } } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        city: true,
        birthDate: true,
      },
      take: 50
    });

    // Fetch friendships and friend requests to determine status in O(1)
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: loggedInUserId }, { userBId: loggedInUserId }] }
    });
    const friendRequests = await prisma.friendRequest.findMany({
      where: { OR: [{ requesterId: loggedInUserId }, { receiverId: loggedInUserId }] }
    });

    const friendIds = new Set(friendships.map(f => (f.userAId === loggedInUserId ? f.userBId : f.userAId)));
    const pendingRequesterIds = new Set(friendRequests.filter(r => r.status === 'PENDING').map(r => (r.requesterId === loggedInUserId ? r.receiverId : r.requesterId)));

    const requestMap = {};
    friendRequests.forEach(r => {
      if (r.status === 'PENDING') {
        const otherId = r.requesterId === loggedInUserId ? r.receiverId : r.requesterId;
        requestMap[otherId] = {
          id: r.id,
          senderId: r.requesterId
        };
      }
    });

    const results = matchingUsers.map(u => {
      let friendshipStatus = 'none';
      let requestId = null;
      let isRequestSender = false;

      if (friendIds.has(u.id)) {
        friendshipStatus = 'friends';
      } else if (pendingRequesterIds.has(u.id)) {
        friendshipStatus = 'pending';
        requestId = requestMap[u.id]?.id || null;
        isRequestSender = requestMap[u.id]?.senderId === loggedInUserId;
      }

      return {
        id: u.id,
        name: publicDisplayName(u.name, 'משתמש'),
        imageUrl: u.imageUrl,
        // Same rule as the profile endpoint: a non-friend gets no city for a minor.
        city: directoryCity(u, friendIds.has(u.id)),
        friendshipStatus,
        requestId,
        isRequestSender,
        // Always true: a false value would single out friends-only minors. The send
        // endpoint enforces the real rule (403 PROFILE_FRIENDS_ONLY).
        canAddFriend: true,
      };
    });
    console.log(`[Backend User Search] ✅ Found ${results.length} matching users. Returning results.`);
    res.json(results);
  } catch (error) {
    console.error('[Backend User Search] ❌ Error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// GET /api/users/notifications/counts - Aggregated Navbar/Tab badge counters
// (pending friend requests awaiting the caller's decision + unread chat *rooms*
// across all rooms the caller belongs to). Kept as a static route, registered
// before any '/:id'-style routes below to avoid path collisions.
router.get('/notifications/counts', authenticateToken, async (req, res) => {
  try {
    const counters = await getCounters(prisma, req.user.id);
    res.json(counters);
  } catch (e) {
    console.error('Get notification counters error:', e);
    res.status(500).json({ error: 'Failed to fetch notification counters' });
  }
});

// PUT /api/users/profile/settings - update the caller's privacy flags.
// Static path registered before '/:id' routes to avoid param capture.
router.put('/profile/settings', authenticateToken, async (req, res) => {
  try {
    const { privacyFriends, privacyGames, privacyMessages, hideGroups } = req.body || {};
    if (typeof hideGroups !== 'undefined' && typeof hideGroups !== 'boolean') {
      return res.status(400).json({ error: 'Invalid value for hideGroups' });
    }

    const validate = (v, field) => {
      if (typeof v === 'undefined') return undefined;
      if (v === null) return null;
      if (VALID_LEVELS.includes(v)) return v;
      throw new Error(`Invalid value for ${field}`);
    };

    let data;
    try {
      data = {
        ...(typeof privacyFriends !== 'undefined' ? { privacyFriends: validate(privacyFriends, 'privacyFriends') } : {}),
        ...(typeof privacyGames !== 'undefined' ? { privacyGames: validate(privacyGames, 'privacyGames') } : {}),
        ...(typeof privacyMessages !== 'undefined' ? { privacyMessages: validate(privacyMessages, 'privacyMessages') } : {}),
        ...(typeof hideGroups !== 'undefined' ? { hideGroups } : {}),
      };
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        birthDate: true,
        privacyFriends: true,
        privacyGames: true,
        privacyMessages: true,
        hideGroups: true,
      },
    });

    res.json({
      hideGroups: updated.hideGroups,
      privacyFriends: updated.privacyFriends,
      privacyGames: updated.privacyGames,
      privacyMessages: updated.privacyMessages,
      resolved: {
        privacyFriends: resolvePrivacyLevel(updated.privacyFriends, updated.birthDate),
        privacyGames: resolvePrivacyLevel(updated.privacyGames, updated.birthDate),
        privacyMessages: resolvePrivacyLevel(updated.privacyMessages, updated.birthDate),
      },
      ageDefaults: getAgeDefaults(updated.birthDate),
    });
  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// List users (basic listing) — feeds the profile page's "people you may know" widget.
// Signed-in only and always bounded, so the whole users table can't be scraped anonymously.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const take = Math.min(Math.max(parseInt(req.query.take, 10) || 20, 1), 100);
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      take,
      select: { id: true, name: true, imageUrl: true, city: true, birthDate: true },
    });
    const friendIds = new Set(await getFriendIds(req.user.id));
    res.json(users.map(u => ({
      id: u.id,
      name: publicDisplayName(u.name, 'משתמש'),
      imageUrl: u.imageUrl,
      city: directoryCity(u, u.id === req.user.id || friendIds.has(u.id)),
      canAddFriend: true,
    })));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Favorites API
router.get('/:id/favorites', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const rows = await prisma.favoriteField.findMany({ where: { userId: req.params.id }, include: { field: true } });
    res.json(rows.map(r => r.field));
  } catch (e) {
    console.error('Get favorites error:', e);
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

router.post('/:id/favorites/:fieldId', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const row = await prisma.favoriteField.upsert({
      where: { userId_fieldId: { userId: req.user.id, fieldId: req.params.fieldId } },
      update: {},
      create: { userId: req.user.id, fieldId: req.params.fieldId }
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('Add favorite error:', e);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/:id/favorites/:fieldId', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    await prisma.favoriteField.delete({ where: { userId_fieldId: { userId: req.user.id, fieldId: req.params.fieldId } } });
    res.json({ ok: true });
  } catch (e) {
    console.error('Remove favorite error:', e);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});


const VALID_GENDERS = ['MALE', 'FEMALE'];

function calculatedAge(birthDate) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  const ageDt = new Date(diff);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}

function mapUserPublic(u, { includeContact = false, hideDetails = false } = {}) {
  if (!u) return u;
  const base = {
    id: u.id,
    // Other people must never see an email stored in the name column.
    name: includeContact ? u.name : publicDisplayName(u.name, 'משתמש'),
    imageUrl: u.imageUrl,
  };
  if (hideDetails) {
    return { ...base, sports: [], positions: [] };
  }
  return {
    ...base,
    ...(includeContact ? { email: u.email, phone: u.phone, birthDate: u.birthDate } : {}),
    city: u.city,
    gender: u.gender || null,
    age: calculatedAge(u.birthDate),
    sports: (u.sports || []).map(us => ({
      id: us.sport.id,
      name: us.sport.name,
      position: us.positionDescription
    })),
    positions: (u.positions || []).map(up => ({ id: up.position.id, name: up.position.name, sportId: up.position.sportId }))
  };
}

// City in a directory listing. Mirrors the profile endpoint: a known minor's city is only
// shown to the minor themself and confirmed friends.
function directoryCity(u, canSeeDetails) {
  if (!canSeeDetails && isKnownMinor(u.birthDate)) return null;
  return u.city ?? null;
}

async function getFriendIds(userId) {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true }
  });
  return friendships.map(f => (f.userAId === userId ? f.userBId : f.userAId));
}

function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// POST /api/users/:id/rate — submit a one-shot 1–5 star rating for a teammate in a finished game.
router.post('/:id/rate', authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.id;
    const raterId = req.user.id;
    const { gameId, score } = req.body || {};

    if (!gameId) {
      return res.status(400).json({ error: 'gameId is required' });
    }
    if (!validateScore(score)) {
      return res.status(400).json({ error: 'score must be an integer between 1 and 5' });
    }
    if (raterId === targetId) {
      return res.status(400).json({ error: 'Cannot rate yourself' });
    }

    const game = await prisma.game.findUnique({
      where: { id: String(gameId) },
      select: { id: true, start: true, status: true },
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (!isGameRatingEligible(game)) {
      return res.status(400).json({ error: 'Game is not finished yet' });
    }

    const [raterOk, targetOk] = await Promise.all([
      isConfirmedParticipant(gameId, raterId),
      isConfirmedParticipant(gameId, targetId),
    ]);
    if (!raterOk || !targetOk) {
      return res.status(403).json({ error: 'Both users must be confirmed participants in this game' });
    }

    try {
      await prisma.userRating.create({
        data: {
          gameId: String(gameId),
          raterId,
          targetId,
          score,
        },
      });
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(409).json({ error: 'Already rated this player for this game' });
      }
      throw e;
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// The caller's own friends. Declared before /:id so "friends" is never read as a user id.
router.get('/friends', authenticateToken, async (req, res) => {
  try {
    const friendIds = await getFriendIds(req.user.id);
    if (friendIds.length === 0) return res.json([]);
    const friends = await prisma.user.findMany({ where: { id: { in: friendIds } } });
    res.json(friends.map((u) => ({ ...mapUserPublic(u), mutualCount: 0 })));
  } catch (e) {
    console.error('List own friends error:', e);
    res.status(500).json({ error: 'Failed to list friends' });
  }
});

// GET /api/users/blocks - users the caller has blocked
router.get('/blocks', authenticateToken, async (req, res) => {
  try {
    const rows = await prisma.userBlock.findMany({
      where: { blockerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { blockedId: true, createdAt: true, blocked: { select: { id: true, name: true, imageUrl: true } } },
    });
    res.json(rows.map((r) => ({
      id: r.blockedId,
      name: publicDisplayName(r.blocked?.name, null),
      imageUrl: r.blocked?.imageUrl || null,
      blockedAt: r.createdAt,
    })));
  } catch (error) {
    console.error('List blocks error:', error);
    res.status(500).json({ error: 'Failed to list blocked users' });
  }
});

// POST /api/users/:id/block - block a user (idempotent). Also removes any friendship / pending request.
router.post('/:id/block', authenticateToken, async (req, res) => {
  try {
    const blockerId = String(req.user.id);
    const blockedId = String(req.params.id);
    if (RESERVED_USER_IDS.has(blockedId) || blockedId === blockerId) {
      return res.status(400).json({ error: 'Invalid user' });
    }
    await safeUpsertUserFromAuth(prisma, req.user);
    const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true, deletedAt: true } });
    if (!target || target.deletedAt) return res.status(404).json({ error: 'User not found' });
    await prisma.$transaction([
      prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        update: {},
        create: { blockerId, blockedId },
      }),
      prisma.friendship.deleteMany({
        where: { OR: [{ userAId: blockerId, userBId: blockedId }, { userAId: blockedId, userBId: blockerId }] },
      }),
      prisma.friendRequest.deleteMany({
        where: { OR: [{ requesterId: blockerId, receiverId: blockedId }, { requesterId: blockedId, receiverId: blockerId }] },
      }),
    ]);
    await revokePresenceSubscriptions(req.app.get('io'), blockerId, blockedId, { force: true })
      .catch((e) => console.error('[presence] revoke after block failed:', e.message));
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// DELETE /api/users/:id/block - unblock
router.delete('/:id/block', authenticateToken, async (req, res) => {
  try {
    const me = String(req.user.id);
    const other = String(req.params.id);
    // Requests sent while blocked were only ever visible to their sender; drop them in the same
    // transaction as the unblock so a failure cannot leave a request the receiver can now see and
    // accept. Skipped when the other side still blocks me (those rows stay hidden).
    const stillBlockedByOther = !!(await prisma.userBlock.findFirst({
      where: { blockerId: other, blockedId: me },
      select: { id: true },
    }));
    await prisma.$transaction([
      prisma.userBlock.deleteMany({ where: { blockerId: me, blockedId: other } }),
      ...(stillBlockedByOther ? [] : [prisma.friendRequest.deleteMany({
        where: { OR: [{ requesterId: me, receiverId: other }, { requesterId: other, receiverId: me }] },
      })]),
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// DELETE /api/users/me - permanently delete the caller's account (App Store 5.1.1(v)).
// Personal data is erased and the User row is kept as an anonymous tombstone so games, series and
// chat history that reference it stay valid. Every step is idempotent, so a failure part-way
// (e.g. Clerk unreachable) can simply be retried by the user.
router.delete('/me', authenticateToken, async (req, res) => {
  const userId = String(req.user.id);
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { imageUrl: true } });
    if (existing) {
      await prisma.$transaction([
        prisma.participation.deleteMany({ where: { userId } }),
        prisma.chatParticipant.deleteMany({ where: { userId } }),
        prisma.reaction.deleteMany({ where: { userId } }),
        prisma.notification.deleteMany({ where: { userId } }),
        prisma.userDevice.deleteMany({ where: { userId } }),
        prisma.userNotificationSettings.deleteMany({ where: { userId } }),
        prisma.userRating.deleteMany({ where: { OR: [{ raterId: userId }, { targetId: userId }] } }),
        prisma.favoriteField.deleteMany({ where: { userId } }),
        prisma.userSport.deleteMany({ where: { userId } }),
        prisma.userPosition.deleteMany({ where: { userId } }),
        prisma.gameRole.deleteMany({ where: { userId } }),
        prisma.seriesParticipant.deleteMany({ where: { userId } }),
        // The user row is kept (anonymized), so its join requests don't cascade away on their own.
        prisma.seriesJoinRequest.deleteMany({ where: { userId } }),
        prisma.friendship.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
        prisma.friendRequest.deleteMany({ where: { OR: [{ requesterId: userId }, { receiverId: userId }] } }),
        prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
        prisma.fieldCommentReaction.deleteMany({ where: { userId } }),
        prisma.fieldCommentFlag.deleteMany({ where: { reporterId: userId } }),
        // Replies cascade from their parent, so a comment/report others replied to is scrubbed
        // (the author is now the anonymous tombstone) rather than deleted with their replies.
        prisma.fieldComment.deleteMany({ where: { userId, replies: { none: {} } } }),
        prisma.fieldComment.updateMany({ where: { userId }, data: { text: '' } }),
        prisma.fieldIssueReportReaction.deleteMany({ where: { userId } }),
        prisma.fieldIssueReportFlag.deleteMany({ where: { reporterId: userId } }),
        prisma.fieldIssueReport.deleteMany({ where: { userId, replies: { none: {} } } }),
        prisma.fieldIssueReport.updateMany({ where: { userId }, data: { description: null, photoUrl: null } }),
        prisma.supportMessage.deleteMany({ where: { userId } }),
        prisma.fieldSuggestion.deleteMany({ where: { userId } }),
        prisma.message.updateMany({ where: { userId }, data: { text: '', isDeleted: true } }),
        prisma.flaggedMessage.deleteMany({ where: { userId } }),
        prisma.user.update({
          where: { id: userId },
          data: {
            name: DELETED_USER_NAME,
            email: null,
            imageUrl: null,
            city: null,
            phone: null,
            birthDate: null,
            gender: null,
            deletedAt: new Date(),
          },
        }),
      ]);
      if (existing.imageUrl) {
        try { await deleteUploadedFile(existing.imageUrl); } catch (_) { /* best effort */ }
      }
    }
    const { clerkClient, invalidateClerkUser } = require('../utils/auth');
    try {
      await clerkClient.users.deleteUser(userId);
    } catch (e) {
      // Already gone in Clerk counts as success; anything else is surfaced so the user can retry.
      if (!(e && (e.status === 404 || e.errors?.[0]?.code === 'resource_not_found'))) throw e;
    }
    if (typeof invalidateClerkUser === 'function') invalidateClerkUser(userId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Authenticated viewer — includes isAdmin. Must be registered before /:id
// so "me" is never treated as a Clerk user id (which would upsert a stub User).
const BIRTH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sameCalendarDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

function buildAgeGateInfo(user) {
  return {
    status: getAgeGateStatus(user),
    age: getAgeInJerusalem(user?.birthDate),
    minAge: MIN_AGE,
    adultAge: ADULT_AGE,
    legalVersion: LEGAL_VERSION,
  };
}

// POST /api/users/me/age-gate  { birthDate?: 'YYYY-MM-DD', acceptTerms: true, guardianConsent?: boolean }
// Records birth date (once — it is locked afterwards), terms acceptance for the current
// LEGAL_VERSION, and for 13-17 year olds the guardian-consent declaration.
router.post('/me/age-gate', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const { birthDate, acceptTerms, guardianConsent } = req.body || {};

    let user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, birthDate: true } });
    if (!user) user = await safeUpsertUserFromAuth(prisma, req.user);

    let effectiveBirthDate = user.birthDate;
    if (!effectiveBirthDate) {
      if (typeof birthDate !== 'string' || !BIRTH_DATE_RE.test(birthDate) || !isPlausibleBirthDate(birthDate)) {
        return res.status(400).json({ error: 'יש להזין תאריך לידה תקין', code: 'INVALID_BIRTHDATE' });
      }
      effectiveBirthDate = new Date(birthDate);
    } else if (birthDate && !sameCalendarDay(birthDate, effectiveBirthDate)) {
      return res.status(409).json({ error: 'לא ניתן לשנות תאריך לידה. לתיקון יש לפנות לתמיכה', code: 'BIRTHDATE_LOCKED' });
    }

    const age = getAgeInJerusalem(effectiveBirthDate);
    const data = user.birthDate ? {} : { birthDate: effectiveBirthDate };

    if (age >= MIN_AGE) {
      if (acceptTerms !== true) {
        return res.status(400).json({ error: 'יש לאשר את תנאי השימוש ומדיניות הפרטיות', code: 'TERMS_REQUIRED' });
      }
      const isMinor = age < ADULT_AGE;
      if (isMinor && guardianConsent !== true) {
        return res.status(400).json({ error: 'נדרשת הצהרה על הסכמת הורה או אפוטרופוס', code: 'GUARDIAN_CONSENT_REQUIRED' });
      }
      const now = new Date();
      Object.assign(data, {
        termsAcceptedAt: now,
        termsVersion: LEGAL_VERSION,
        guardianConsentAt: isMinor ? now : null,
      });
    }
    // Under MIN_AGE: only the birth date is stored (so it can't be re-entered differently);
    // the account stays gated and the client offers account deletion.

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { birthDate: true, termsAcceptedAt: true, termsVersion: true, guardianConsentAt: true },
    });
    invalidateAccountState(userId);
    res.json({ ageGate: buildAgeGateInfo(updated) });
  } catch (error) {
    console.error('Age gate error:', error);
    res.status(500).json({ error: 'Failed to save' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, imageUrl: true, email: true, city: true,
        birthDate: true, termsAcceptedAt: true, termsVersion: true, guardianConsentAt: true,
      },
    });
    res.json({
      id: req.user.id,
      name: user?.name || req.user.name || null,
      imageUrl: user?.imageUrl || req.user.avatar || null,
      email: user?.email || null,
      city: user?.city || null,
      isAdmin: !!req.user.isAdmin,
      ageGate: buildAgeGateInfo(user),
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Public user profile (safe fields) with privacy-aware Friends / Match History sections.
router.get('/:id', attachOptionalUser, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (RESERVED_USER_IDS.has(targetId)) return res.status(404).json({ error: 'User not found' });
    let user = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        sports: { include: { sport: true } },
        positions: { include: { position: true } }
      }
    });
    if (!user) {
      // Only the signed-in owner may materialize their own row (first visit before any other
      // write synced it). Unknown ids from anyone else 404 instead of creating junk user rows.
      if (!req.user || req.user.id !== targetId) return res.status(404).json({ error: 'User not found' });
      await safeUpsertUserFromAuth(prisma, req.user);
      user = await prisma.user.findUnique({
        where: { id: targetId },
        include: { sports: { include: { sport: true } }, positions: { include: { position: true } } }
      });
    }

    const viewerId = req.user?.id || null;
    const isOwner = viewerId === targetId;
    const isFriend = viewerId && !isOwner ? await areConfirmedFriends(viewerId, targetId) : false;

    const effFriends = resolvePrivacyLevel(user.privacyFriends, user.birthDate);
    const effGames = resolvePrivacyLevel(user.privacyGames, user.birthDate);
    const effMessages = resolvePrivacyLevel(user.privacyMessages, user.birthDate);

    const age = getAgeInJerusalem(user.birthDate);
    const isMinor = age !== null && age < ADULT_AGE;
    // Minor profiles default to friends-only. Non-friends do not get age or the
    // rest of the about section (city, gender, sports), even if a row was stored
    // before that default existed.
    const profileRestricted = !isOwner && !isFriend && isMinor;

    const showFriends = canViewSection({ effectivePrivacy: effFriends, isOwner, isFriend });
    const showGames = canViewSection({ effectivePrivacy: effGames, isOwner, isFriend });

    // Never an exact answer: a per-profile false would let a non-friend enumerate friends-only
    // minors id by id. The button is always offered; POST /requests enforces the real rule and
    // answers 403 PROFILE_FRIENDS_ONLY (see docs/qa/blocks-and-privacy-contract.md).
    const canAddFriend = true;

    const ratingSummary = await getUserRatingSummary(targetId);

    const payload = {
      ...mapUserPublic(user, { includeContact: isOwner, hideDetails: profileRestricted }),
      profileRestricted,
      canMessage: isOwner || isFriend || effMessages === 'EVERYONE',
      canAddFriend,
      ratingAverage: ratingSummary.ratingAverage,
      totalRatings: ratingSummary.totalRatings,
      sections: { friends: showFriends, matchHistory: showGames },
      friends: null,
      matchHistory: null,
      sportStats: [],
      groups: null,
    };

    // Groups (recurring series) the user belongs to; hidden from others when they opted out.
    // Follows the same visibility rule as match history (privacyGames, age-based default for minors),
    // and friends-only groups are only listed for the owner or confirmed friends.
    if (isOwner || (!user.hideGroups && showGames)) {
      const memberships = await prisma.seriesParticipant.findMany({
        where: {
          userId: targetId,
          series: { isActive: true, ...(isOwner || isFriend ? {} : { isFriendsOnly: false }) },
        },
        select: { series: { select: { id: true, title: true, fieldName: true, sport: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      payload.groups = memberships.map((m) => m.series);
    }

    // Friends list (id/name/imageUrl only) when visible.
    if (showFriends) {
      const friendIds = await getFriendIds(targetId);
        payload.friends = friendIds.length
        ? (await prisma.user.findMany({
            where: { id: { in: friendIds } },
            select: { id: true, name: true, imageUrl: true },
            take: 20,
          })).map((friend) => ({
            ...friend,
            name: publicDisplayName(friend.name, 'משתמש'),
          }))
        : [];
    }

    // Match history + per-sport aggregation when visible.
    if (showGames) {
      const now = new Date();
      const [participations, grouped] = await Promise.all([
        prisma.participation.findMany({
          where: { userId: targetId, status: 'CONFIRMED', game: { start: { lt: now } } },
          select: { game: { select: { id: true, title: true, sport: true, start: true } } },
          orderBy: { game: { start: 'desc' } },
          take: 5,
        }),
        // Count all past CONFIRMED matches grouped by sport.
        prisma.game.groupBy({
          by: ['sport'],
          where: {
            start: { lt: now },
            participants: { some: { userId: targetId, status: 'CONFIRMED' } },
          },
          _count: { _all: true },
        }),
      ]);

      payload.matchHistory = participations.map((p) => p.game);
      payload.sportStats = grouped.map((g) => ({ sport: g.sport, count: g._count._all }));
    }

    // Owner also receives their raw + resolved privacy settings for the settings UI.
    if (isOwner) {
      payload.privacySettings = {
        hideGroups: user.hideGroups,
        privacyFriends: user.privacyFriends,
        privacyGames: user.privacyGames,
        privacyMessages: user.privacyMessages,
        resolved: {
          privacyFriends: effFriends,
          privacyGames: effGames,
          privacyMessages: resolvePrivacyLevel(user.privacyMessages, user.birthDate),
        },
        ageDefaults: getAgeDefaults(user.birthDate),
      };
    }

    res.json(payload);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Paginated match history (privacy-enforced). Used by the profile "Load More" button.
router.get('/:id/match-history', attachOptionalUser, async (req, res) => {
  try {
    const targetId = req.params.id;
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const take = Math.min(20, Math.max(1, parseInt(req.query.take, 10) || 5));

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { birthDate: true, privacyGames: true },
    });
    if (!user) return res.json([]);

    const viewerId = req.user?.id || null;
    const isOwner = viewerId === targetId;
    const isFriend = viewerId && !isOwner ? await areConfirmedFriends(viewerId, targetId) : false;
    const effGames = resolvePrivacyLevel(user.privacyGames, user.birthDate);

    if (!canViewSection({ effectivePrivacy: effGames, isOwner, isFriend })) {
      return res.status(403).json({ error: 'This section is private' });
    }

    const participations = await prisma.participation.findMany({
      where: { userId: targetId, status: 'CONFIRMED', game: { start: { lt: new Date() } } },
      select: { game: { select: { id: true, title: true, sport: true, start: true } } },
      orderBy: { game: { start: 'desc' } },
      skip,
      take,
    });

    res.json(participations.map((p) => p.game));
  } catch (error) {
    console.error('Match history pagination error:', error);
    res.status(500).json({ error: 'Failed to load match history' });
  }
});

// Update user profile (owner only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, email, phone, imageUrl, city, birthDate, gender, sportIds, sportsData, positionIds } = req.body;

    if (typeof gender !== 'undefined' && gender !== null && !VALID_GENDERS.includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender. Must be MALE or FEMALE.' });
    }

    // imageUrl may only point at storage we manage if it is already this user's current image;
    // otherwise someone could adopt another user's Cloudinary URL and then delete/replace it,
    // which would destroy the victim's file. New images go through POST /:id/image.
    if (typeof imageUrl === 'string' && isManagedUploadUrl(imageUrl)) {
      const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { imageUrl: true } });
      if (current?.imageUrl !== imageUrl) {
        return res.status(400).json({ error: 'Use the image upload endpoint to set a profile image' });
      }
    }

    // Birth date drives minor protections, so once set it can only be changed by support.
    if (typeof birthDate !== 'undefined') {
      const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { birthDate: true } });
      if (current?.birthDate && (!birthDate || !sameCalendarDay(birthDate, current.birthDate))) {
        return res.status(409).json({ error: 'לא ניתן לשנות תאריך לידה. לתיקון יש לפנות לתמיכה', code: 'BIRTHDATE_LOCKED' });
      }
      if (birthDate && !isPlausibleBirthDate(birthDate)) {
        return res.status(400).json({ error: 'יש להזין תאריך לידה תקין', code: 'INVALID_BIRTHDATE' });
      }
    }

    let cleanName;
    if (typeof name !== 'undefined') {
      cleanName = typeof name === 'string' ? sanitizeFreeText(name, DISPLAY_NAME_MAX_LENGTH).trim() : '';
      if (cleanName.length < DISPLAY_NAME_MIN_LENGTH) {
        return res.status(400).json({ error: `יש להזין שם (לפחות ${DISPLAY_NAME_MIN_LENGTH} תווים)` });
      }
    }

    const data = {
      ...(typeof cleanName !== 'undefined' ? { name: cleanName } : {}),
      ...(typeof email !== 'undefined' ? { email: email || null } : {}),
      ...(typeof phone !== 'undefined' ? { phone } : {}),
      ...(typeof imageUrl !== 'undefined' ? { imageUrl } : {}),
      ...(typeof city !== 'undefined' ? { city } : {}),
      ...(typeof birthDate !== 'undefined' ? { birthDate: birthDate ? new Date(birthDate) : null } : {}),
      ...(typeof gender !== 'undefined' ? { gender: gender || null } : {}),
    };

    const updated = await prisma.user.update({ where: { id: req.user.id }, data });

    // Update sports with positions
    if (Array.isArray(sportsData)) {
      await ensureSportsSeeded();
      await prisma.userSport.deleteMany({ where: { userId: req.user.id } });
      if (sportsData.length > 0) {
        await prisma.userSport.createMany({
          data: sportsData.map((s) => ({
            userId: req.user.id,
            sportId: String(s.sportId),
            positionDescription: s.position || null
          }))
        });
      }
    } else if (Array.isArray(sportIds)) {
      // Legacy support or simple list
      await prisma.userSport.deleteMany({ where: { userId: req.user.id } });
      await prisma.userSport.createMany({ data: sportIds.map((sid) => ({ userId: req.user.id, sportId: String(sid) })) });
    }

    // Optional: replace positions
    if (Array.isArray(positionIds)) {
      await prisma.userPosition.deleteMany({ where: { userId: req.user.id } });
      await prisma.userPosition.createMany({ data: positionIds.map((pid) => ({ userId: req.user.id, positionId: String(pid) })) });
    }

    const full = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { sports: { include: { sport: true } }, positions: { include: { position: true } } }
    });
    res.json(mapUserPublic(full, { includeContact: true }));
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
      return res.status(409).json({ error: 'כתובת האימייל הזו כבר בשימוש על ידי משתמש אחר' });
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Upload profile image (owner only)
router.post('/:id/image', authenticateToken, handleSingleUpload(userImageUpload, 'image'), async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.user.id }, select: { imageUrl: true } });
    const imageUrl = absoluteUrlFor(req, 'users', req.file.filename);
    await prisma.user.update({ where: { id: req.user.id }, data: { imageUrl } });
    if (existing?.imageUrl) deleteUploadedFile(existing.imageUrl);

    res.json({ imageUrl });
  } catch (error) {
    console.error('Upload user image error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Remove profile image (owner only)
router.delete('/:id/image', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const existing = await prisma.user.findUnique({ where: { id: req.user.id }, select: { imageUrl: true } });
    await prisma.user.update({ where: { id: req.user.id }, data: { imageUrl: null } });
    if (existing?.imageUrl) deleteUploadedFile(existing.imageUrl);
    res.json({ imageUrl: null });
  } catch (error) {
    console.error('Remove user image error:', error);
    res.status(500).json({ error: 'Failed to remove image' });
  }
});

// List friends for a user (public basic info), gated by the target's privacyFriends setting
// exactly like the Friends section of GET /:id.
router.get('/:id/friends', attachOptionalUser, async (req, res) => {
  try {
    const targetId = req.params.id;
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { birthDate: true, privacyFriends: true },
    });
    if (!target) return res.json([]);

    const viewerId = req.user?.id || null;
    const isOwner = viewerId === targetId;
    const isFriend = viewerId && !isOwner ? await areConfirmedFriends(viewerId, targetId) : false;
    const effFriends = resolvePrivacyLevel(target.privacyFriends, target.birthDate);
    if (!canViewSection({ effectivePrivacy: effFriends, isOwner, isFriend })) {
      return res.status(403).json({ error: 'This section is private' });
    }

    const friendIds = await getFriendIds(targetId);
    if (friendIds.length === 0) return res.json([]);
    const friends = await prisma.user.findMany({ where: { id: { in: friendIds } } });
    // mutual friends relative to current viewer (if signed in)
    let viewerMutual = new Set();
    if (viewerId) {
      const ids = await getFriendIds(viewerId);
      viewerMutual = new Set(ids);
    }
    const mapped = friends.map(u => ({
      ...mapUserPublic(u),
      mutualCount: Array.from(viewerMutual).includes(u.id) ? 1 : 0 // simple approx
    }));
    res.json(mapped);
  } catch (e) {
    console.error('List friends error:', e);
    res.status(500).json({ error: 'Failed to list friends' });
  }
});

// A pending request with no bell (notification create failed, or a later retry hit the
// old "already exists" 400) must be repairable. Look the row up in JS — Prisma JSON
// path filters are not reliable for `data.friendRequestId`.
async function ensureFriendRequestNotification(req, fr) {
  const receiverId = fr.receiverId;
  const requesterId = fr.requesterId;
  const recent = await prisma.notification.findMany({
    where: { userId: receiverId, type: 'FRIEND_REQUEST' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { data: true },
  });
  const already = recent.some((n) => n.data && n.data.friendRequestId === fr.id);
  if (already) return;

  const requester = await prisma.user.findUnique({ where: { id: requesterId } });
  const requesterLabel = await notificationName(
    prisma,
    requester || { id: requesterId, name: req.user.name },
    'משתמש'
  );
  await notificationService.sendNotification(
    receiverId,
    'FRIEND_REQUEST',
    'בקשת חברות חדשה',
    `${requesterLabel} שלח/ה לך בקשת חברות`,
    {
      friendRequestId: fr.id,
      requesterId,
      actorId: requesterId,
      requesterName: requesterLabel,
      link: '/friends',
    },
    req.app.get('io')
  );
}

function notifyFailure(res, err) {
  console.error('[NOTIFICATION] Failed to send friend request notification:', err);
  return res.status(500).json({ error: 'Failed to notify the recipient', code: 'NOTIFICATION_FAILED' });
}

// Send friend request
router.post('/requests', authenticateToken, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { receiverId } = req.body;
    if (!receiverId || receiverId === requesterId) return res.status(400).json({ error: 'Invalid receiver' });
    // Ensure the requester exists; never invent a placeholder row for an unknown receiver
    await safeUpsertUserFromAuth(prisma, req.user);
    const rx = await prisma.user.findUnique({
      where: { id: String(receiverId) },
      select: { id: true, birthDate: true, privacyFriends: true },
    });
    if (!rx) return res.status(404).json({ error: 'User not found' });
    // Every gate below answers a blocked sender exactly like an unblocked one. The block
    // only turns the final write + notification into a no-op (a normal-looking 201).
    const blocked = await isBlockedEitherWay(requesterId, receiverId);
    const [a, b] = orderPair(requesterId, receiverId);
    const existingFriend = await prisma.friendship.findFirst({ where: { OR: [{ userAId: a, userBId: b }, { userAId: b, userBId: a }] } });
    if (existingFriend) return res.status(400).json({ error: 'Already friends' });

    // Across a block only the caller's own direction counts: the other side's rows are hidden
    // from this user, so they must not surface here as INCOMING_REQUEST_EXISTS either.
    const existingReq = await prisma.friendRequest.findFirst({
      where: blocked
        ? { requesterId, receiverId }
        : { OR: [{ requesterId, receiverId }, { requesterId: receiverId, receiverId: requesterId }] },
    });

    if (existingReq && existingReq.status === 'PENDING') {
      if (existingReq.requesterId !== requesterId) {
        return res.status(400).json({
          error: 'This user already sent you a friend request',
          code: 'INCOMING_REQUEST_EXISTS',
        });
      }
      // Same-direction pending: keep the original contract (400 'Request already exists', which
      // every released app build understands) but still repair a missing bell for the receiver.
      if (!blocked) {
        try {
          await ensureFriendRequestNotification(req, existingReq);
        } catch (err) {
          console.error('Friend request notification repair failed:', err);
        }
        broadcastCounters(req.app.get('io'), prisma, receiverId).catch(() => {});
      }
      return res.status(400).json({ error: 'Request already exists', code: 'REQUEST_ALREADY_PENDING' });
    }

    if (
      existingReq &&
      existingReq.status === 'DECLINED' &&
      existingReq.requesterId === requesterId &&
      Date.now() - new Date(existingReq.createdAt).getTime() < DECLINED_RESEND_COOLDOWN_MS
    ) {
      return res.status(400).json({
        error: 'Your previous request was declined; you can send a new one later',
        code: 'REQUEST_DECLINED_RECENTLY',
      });
    }

    // Friends-only minor rule, applied before the block short-circuit so blocked and
    // unblocked senders get the same answer: another minor may ask; an adult may not, unless
    // the minor explicitly chose EVERYONE.
    if (!canRequestFriendship({
      targetBirthDate: rx.birthDate,
      targetPrivacyFriends: rx.privacyFriends,
      requesterBirthDate: null,
    })) {
      const requesterRow = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { birthDate: true },
      });
      if (!canRequestFriendship({
        targetBirthDate: rx.birthDate,
        targetPrivacyFriends: rx.privacyFriends,
        requesterBirthDate: requesterRow?.birthDate ?? null,
      })) {
        return res.status(403).json({
          error: 'This profile only accepts friend requests from friends',
          code: 'PROFILE_FRIENDS_ONLY',
        });
      }
    }

    if (existingReq && existingReq.status === 'DECLINED') {
      // A declined request must not block the pair forever.
      // deleteMany: two concurrent re-sends must not make the second one fail with P2025 (a 500)
      await prisma.friendRequest.deleteMany({ where: { id: existingReq.id } });
    }

    let fr;
    try {
      fr = await prisma.friendRequest.create({ data: { requesterId, receiverId } });
    } catch (err) {
      if (err && err.code === 'P2002') {
        const pending = await prisma.friendRequest.findFirst({
          where: { requesterId, receiverId, status: 'PENDING' },
        });
        if (pending && !blocked) {
          try {
            await ensureFriendRequestNotification(req, pending);
          } catch (notifyErr) {
            console.error('Friend request notification repair failed:', notifyErr);
          }
          broadcastCounters(req.app.get('io'), prisma, receiverId).catch(() => {});
        }
        return res.status(400).json({ error: 'Request already exists', code: 'REQUEST_ALREADY_PENDING' });
      }
      throw err;
    }

    // A blocked pair gets a real pending row so repeat sends behave exactly like an unblocked
    // sender's (201, then 400 "Request already exists"). The row is hidden from the receiver
    // everywhere (list, counters, accept/decline) while the block exists, no bell is created, and
    // it is deleted on unblock.
    // Re-check: a block created while this request was being written must not produce a bell.
    if (blocked || await isBlockedEitherWay(requesterId, receiverId)) return res.status(201).json(fr);
    try {
      await ensureFriendRequestNotification(req, fr);
    } catch (err) {
      return notifyFailure(res, err);
    }
    broadcastCounters(req.app.get('io'), prisma, receiverId).catch(() => {});
    return res.status(201).json(fr);
  } catch (e) {
    console.error('Send request error:', e);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// Incoming requests for current user
router.get('/:id/requests/incoming', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    // Requests a blocked sender made while blocked exist only for the sender; never list them.
    const hidden = await getBlockedEitherWayIds(req.user.id);
    const list = await prisma.friendRequest.findMany({
      where: { receiverId: req.user.id, status: 'PENDING', ...(hidden.length ? { requesterId: { notIn: hidden } } : {}) },
      include: { requester: true },
    });
    res.json(list.map(r => ({ id: r.id, requester: mapUserPublic(r.requester), createdAt: r.createdAt })));
  } catch (e) {
    console.error('Incoming requests error:', e);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Outgoing requests for current user
router.get('/:id/requests/outgoing', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const list = await prisma.friendRequest.findMany({ where: { requesterId: req.user.id, status: 'PENDING' }, include: { receiver: true } });
    res.json(list.map(r => ({ id: r.id, receiver: mapUserPublic(r.receiver), createdAt: r.createdAt })));
  } catch (e) {
    console.error('Outgoing requests error:', e);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Accept request
router.post('/requests/:id/accept', authenticateToken, async (req, res) => {
  try {
    const reqRow = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow || reqRow.receiverId !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    if (await isBlockedEitherWay(reqRow.requesterId, reqRow.receiverId)) return res.status(404).json({ error: 'Request not found' });
    const [a, b] = orderPair(reqRow.requesterId, reqRow.receiverId);
    await prisma.$transaction([
      prisma.friendRequest.delete({ where: { id: reqRow.id } }),
      prisma.friendship.create({ data: { userAId: a, userBId: b } })
    ]);

    // Send notification to requester
    const accepter = await prisma.user.findUnique({ where: { id: req.user.id } });
    const accepterLabel = await notificationName(prisma, accepter || { id: req.user.id, name: req.user.name }, 'משתמש');
    await notificationService.sendNotification(
      reqRow.requesterId,
      'FRIEND_ACCEPTED',
      'בקשת חברות אושרה',
      `${accepterLabel} אישר/ה את בקשת החברות שלך`,
      {
        userId: req.user.id,
        actorId: req.user.id,
        userName: accepterLabel,
        link: `/user/${req.user.id}`
      },
      req.app.get('io')
    ).catch(err => console.error('[NOTIFICATION] Failed to send friend accepted notification:', err));

    // The accepter's pending-request badge count just dropped by one.
    broadcastCounters(req.app.get('io'), prisma, req.user.id).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    console.error('Accept request error:', e);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// Cancel a request the caller sent (requester side; decline above is the receiver side)
router.post('/requests/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const reqRow = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow || reqRow.requesterId !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    await prisma.friendRequest.delete({ where: { id: reqRow.id } });

    // A receiver across a block never saw the request, so there is nothing to refresh for them.
    if (!(await isBlockedEitherWay(reqRow.requesterId, reqRow.receiverId))) {
      broadcastCounters(req.app.get('io'), prisma, reqRow.receiverId).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Cancel request error:', e);
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// Decline request
router.post('/requests/:id/decline', authenticateToken, async (req, res) => {
  try {
    const reqRow = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!reqRow || reqRow.receiverId !== req.user.id) return res.status(404).json({ error: 'Request not found' });
    if (await isBlockedEitherWay(reqRow.requesterId, reqRow.receiverId)) return res.status(404).json({ error: 'Request not found' });
    // createdAt doubles as "when this request last changed state": the resend cooldown (see
    // DECLINED_RESEND_COOLDOWN_MS) is measured from the decline, not from when it was first sent.
    await prisma.friendRequest.update({ where: { id: reqRow.id }, data: { status: 'DECLINED', createdAt: new Date() } });

    // The decliner's pending-request badge count just dropped by one.
    broadcastCounters(req.app.get('io'), prisma, req.user.id).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    console.error('Decline request error:', e);
    res.status(500).json({ error: 'Failed to decline request' });
  }
});

// Remove friend
router.delete('/:id/friends/:friendId', authenticateToken, async (req, res) => {
  try {
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    const [a, b] = orderPair(req.user.id, req.params.friendId);
    await prisma.friendship.delete({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    await revokePresenceSubscriptions(req.app.get('io'), req.user.id, req.params.friendId)
      .catch((e) => console.error('[presence] revoke after unfriend failed:', e.message));
    res.json({ ok: true });
  } catch (e) {
    console.error('Remove friend error:', e);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// List all chats for a user (Groups + Private, Relational)
router.get('/:id/chats', authenticateToken, async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    // Fetch all chat participations for the user
    const participations = await prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        chat: {
          include: {
            participants: {
              include: { user: true }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              where: {
                OR: [
                  { status: { not: 'blocked' } },
                  { userId }
                ]
              }
            }
          }
        }
      }
    });

    // Pre-fetch Games for Group Chats
    const groupChatIds = participations
      .filter(p => p.chat.type.toUpperCase() === 'GROUP')
      .map(p => p.chatId);

    const gameMap = {};
    if (groupChatIds.length > 0) {
      const games = await prisma.game.findMany({
        where: { id: { in: groupChatIds } },
        select: {
          id: true,
          title: true,
          status: true,
          field: { select: { name: true } }
        }
      });
      games.forEach(g => { gameMap[g.id] = { ...g, fieldName: g.field?.name }; });
    }

    // Pre-fetch Unread Message Counts (Bulk query avoiding N+1)
    const chatIds = participations.map(p => p.chatId);
    
    let unreadMap = {};
    // Same rule as the total badge (counterService): people I blocked never count as unread.
    const blockedByMeIds = chatIds.length > 0 ? await getBlockedByMe(userId) : [];
    if (chatIds.length > 0) {
      const unreadCounts = await prisma.message.groupBy({
        by: ['chatRoomId'],
        where: {
          chatRoomId: { in: chatIds },
          userId: { notIn: [userId, ...blockedByMeIds] },
          status: { notIn: ['read', 'blocked'] }
        },
        _count: { id: true }
      });
      
      unreadMap = unreadCounts.reduce((acc, curr) => {
        acc[curr.chatRoomId] = curr._count.id;
        return acc;
      }, {});
    }

    const results = participations.map((p) => {
      const chat = p.chat;
      // For private chats, the "other" user is the name/image
      const otherParticipant = chat.participants.find(part => part.userId !== userId)?.user;

      const lastMsg = chat.messages[0];

      // Determine Chat Name
      let chatName = 'Group Chat';
      if (chat.type === 'PRIVATE') {
        chatName = publicDisplayName(otherParticipant?.name);
      } else {
        // GROUP: Use Game Title if available
        const g = gameMap[chat.id];
        if (g) {
          chatName = g.title || g.fieldName || 'Game Chat';
        }
      }

      return {
        id: chat.id,
        type: chat.type.toLowerCase(), // 'private' or 'group'
        name: chatName,
        image: chat.type === 'PRIVATE' ? (otherParticipant?.imageUrl || null) : null,
        otherUserId: chat.type === 'PRIVATE' ? otherParticipant?.id : undefined,
        unreadCount: unreadMap[chat.id] || 0,
        lastMessage: lastMsg ? {
          text: lastMsg.text,
          createdAt: lastMsg.createdAt,
          senderId: lastMsg.userId,
          status: lastMsg.status
        } : null
      };
    });

    const parsedChats = Array.from(
      new Map(results.filter(Boolean).map((c) => [c.id, c])).values()
    );

    // Sort by last message time
    parsedChats.sort((a, b) => {
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    res.json(parsedChats);
  } catch (e) {
    console.error('Get chats error:', e);
    res.status(500).json({ error: 'Failed to get chats' });
  }
});

module.exports = router; 