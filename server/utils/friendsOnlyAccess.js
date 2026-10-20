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
        select: { status: true },
      });
  if (row && row.status !== 'REJECTED') return 'FULL';

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
    areFriends(prisma, game.organizerId, viewerId),
  ]);
  if (role || member || friend) return 'FULL';

  if (row) return 'REQUEST';
  return outsiderAccess(game.friendsOnlyLinkPolicy);
}

/** Per-viewer DTO tweak: an outsider sees the game as approval-gated (existing "request to join" UI). */
function applyViewerAccess(dto, access) {
  dto.viewerJoinRequiresApproval = access === 'REQUEST';
  if (access === 'REQUEST') dto.joinPolicy = 'REQUIRES_APPROVAL';
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
  seriesVisibilityWhere,
};
