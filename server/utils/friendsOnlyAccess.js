// Who may see / join a friends-only game or group, and how.
//
//   'FULL'    -> sees it and joins under its normal rules
//   'REQUEST' -> sees it, but joining becomes a request the managers approve
//   'NONE'    -> may not see it at all
//
// "Insiders" (organizer, admin, friends of the organizer, anyone already on the roster / in the
// group, game managers) always get FULL. Everyone else gets REQUEST or NONE depending on the
// game's / group's friendsOnlyLinkPolicy. Checks run cheapest-first so the common cases (public
// game, organizer, rostered player) cost no extra queries.

const BLOCKED = 'BLOCKED';
const REQUEST_TO_JOIN = 'REQUEST_TO_JOIN';
const LINK_POLICIES = [REQUEST_TO_JOIN, BLOCKED];

function normalizeLinkPolicy(value) {
  return LINK_POLICIES.includes(value) ? value : undefined;
}

function outsiderAccess(policy) {
  return policy === BLOCKED ? 'NONE' : 'REQUEST';
}

async function areFriends(prisma, a, b) {
  if (!a || !b || a === b) return false;
  const row = await prisma.friendship.findFirst({
    where: { OR: [{ userAId: a, userBId: b }, { userAId: b, userBId: a }] },
    select: { id: true },
  });
  return !!row;
}

/** Friends-only right now (mirrors gameService.isPubliclyVisible / buildVisibilityWhere). */
function isGameFriendsOnlyNow(game) {
  if (!game.isFriendsOnly) return false;
  return !(game.friendsOnlyUntil && new Date(game.friendsOnlyUntil) <= new Date());
}

async function getGameAccess(prisma, game, viewerId, { isAdmin = false } = {}) {
  if (!isGameFriendsOnlyNow(game)) return 'FULL';
  if (isAdmin) return 'FULL';
  if (!viewerId) return outsiderAccess(game.friendsOnlyLinkPolicy);
  if (game.organizerId === viewerId) return 'FULL';

  // A roster row means they already know the game (invited, pending, waitlisted), so they keep
  // full access. A REJECTED row only keeps the game viewable: joining must still go through
  // approval, or a declined outsider could re-join instantly.
  const row = Array.isArray(game.participants)
    ? game.participants.find((p) => p.userId === viewerId)
    : await prisma.participation.findFirst({
        where: { gameId: game.id, userId: viewerId },
        select: { status: true, isWaitlistOffer: true },
      });
  // A self-requested PENDING row is just an outsider waiting for approval: it must not unlock
  // the roster. Only a PENDING waitlist offer (the organizer reached out) counts as known.
  // On a BLOCKED-link game outsiders cannot request at all, so any row there was created by a manager.
  const isOutsiderRequest = !!row && (
    row.status === 'REJECTED' ||
    (row.status === 'PENDING' && !row.isWaitlistOffer && game.friendsOnlyLinkPolicy !== BLOCKED)
  );
  if (row && !isOutsiderRequest) return 'FULL';

  const hasLoadedRole = Array.isArray(game.roles) && game.roles.some((r) => r.userId === viewerId);
  if (hasLoadedRole) return 'FULL';

  // Independent checks, run together: a game role (when roles weren't loaded), membership of the
  // game's group (members can join every game of it, including ones generated before they were
  // approved), and friendship with the organizer.
  const [role, member, friend] = await Promise.all([
    Array.isArray(game.roles)
      ? null
      : prisma.gameRole.findFirst({ where: { gameId: game.id, userId: viewerId }, select: { id: true } }),
    game.seriesId
      ? prisma.seriesParticipant.findUnique({
          where: { seriesId_userId: { seriesId: game.seriesId, userId: viewerId } },
          select: { id: true },
        })
      : null,
    // With members-only priority the organizer's friends are outsiders unless they are members.
    game.membersOnlyPriority ? false : areFriends(prisma, game.organizerId, viewerId),
  ]);
  if (role || member || friend) return 'FULL';

  if (row) return 'REQUEST';
  return outsiderAccess(game.friendsOnlyLinkPolicy);
}

/** Per-viewer DTO tweak: an outsider sees the game as approval-gated (existing "request to join" UI). */
function applyViewerAccess(dto, access) {
  dto.viewerJoinRequiresApproval = access === 'REQUEST';
  if (access === 'REQUEST') {
    dto.joinPolicy = 'REQUIRES_APPROVAL';
    // An outsider holding the link can ask to join, but must not see who plays or the custom /
    // exact address in this payload. The venue itself (fieldId/name, a public field record) stays
    // so the card still reads correctly; counts stay too.
    dto.participants = [];
    dto.waitlistParticipants = [];
    dto.managers = [];
    dto.teams = (dto.teams || []).map((t) => ({ ...t, managerId: null, playerIds: [] }));
    dto.draftingManagerIds = dto.organizerId ? [String(dto.organizerId)] : [];
    dto.pickTurnOrder = [];
    dto.managerPickChatId = null;
    dto.customLocation = null;
    dto.customLat = null;
    dto.customLng = null;
    dto.fieldLat = null;
    dto.fieldLng = null;
    dto.fieldLocation = '';
  }
  return dto;
}

/** Prisma `where` fragment: the organizer is a friend of `viewerId` (Friendship stores each pair once). */
function organizerIsFriendWhere(viewerId) {
  return {
    organizer: {
      OR: [
        { friendshipsA: { some: { userBId: viewerId } } },
        { friendshipsB: { some: { userAId: viewerId } } },
      ],
    },
  };
}

async function getSeriesAccess(prisma, series, viewerId, { isAdmin = false } = {}) {
  if (!series.isFriendsOnly) return 'FULL';
  if (isAdmin) return 'FULL';
  if (!viewerId) return outsiderAccess(series.friendsOnlyLinkPolicy);
  if (series.organizerId === viewerId) return 'FULL';

  const member = await prisma.seriesParticipant.findUnique({
    where: { seriesId_userId: { seriesId: series.id, userId: viewerId } },
    select: { id: true },
  });
  if (member) return 'FULL';

  if (await areFriends(prisma, series.organizerId, viewerId)) return 'FULL';
  return outsiderAccess(series.friendsOnlyLinkPolicy);
}

/**
 * What joining the group (becoming a member) takes for this viewer: 'FULL' joins directly,
 * 'REQUEST' needs a manager's approval, 'NONE' may not join. On a members-only-priority group
 * every non-member needs approval, the organizer's friends included.
 */
async function getSeriesJoinAccess(prisma, series, viewerId, { isAdmin = false } = {}) {
  const access = await getSeriesAccess(prisma, series, viewerId, { isAdmin });
  if (access !== 'FULL' || !series.membersOnlyPriority) return access;
  if (isAdmin || !viewerId || series.organizerId === viewerId) return viewerId ? 'FULL' : access;
  const member = await prisma.seriesParticipant.findUnique({
    where: { seriesId_userId: { seriesId: series.id, userId: viewerId } },
    select: { id: true },
  });
  return member ? 'FULL' : 'REQUEST';
}

/** Prisma `where` for group lists: friends-only groups only for insiders (like buildVisibilityWhere). */
function seriesVisibilityWhere(viewerId) {
  if (!viewerId) return { isFriendsOnly: false };
  return {
    OR: [
      { isFriendsOnly: false },
      { organizerId: viewerId },
      { subscribers: { some: { userId: viewerId } } },
      organizerIsFriendWhere(viewerId),
    ],
  };
}

module.exports = {
  LINK_POLICIES,
  normalizeLinkPolicy,
  areFriends,
  isGameFriendsOnlyNow,
  getGameAccess,
  applyViewerAccess,
  organizerIsFriendWhere,
  getSeriesAccess,
  getSeriesJoinAccess,
  seriesVisibilityWhere,
};
