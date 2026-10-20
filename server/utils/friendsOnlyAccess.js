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

  // Any roster row counts (invited, pending request, waitlisted, even rejected): they already
  // know the game, and hiding it now would only break their notification links.
  const onRoster = Array.isArray(game.participants)
    ? game.participants.some((p) => p.userId === viewerId)
    : !!(await prisma.participation.findFirst({
        where: { gameId: game.id, userId: viewerId },
        select: { id: true },
      }));
  if (onRoster) return 'FULL';

  const hasRole = Array.isArray(game.roles)
    ? game.roles.some((r) => r.userId === viewerId)
    : !!(await prisma.gameRole.findFirst({
        where: { gameId: game.id, userId: viewerId },
        select: { id: true },
      }));
  if (hasRole) return 'FULL';

  // Group members can join every game of their group, including the ones generated before they
  // were approved into it.
  if (game.seriesId) {
    const member = await prisma.seriesParticipant.findUnique({
      where: { seriesId_userId: { seriesId: game.seriesId, userId: viewerId } },
      select: { id: true },
    });
    if (member) return 'FULL';
  }

  if (await areFriends(prisma, game.organizerId, viewerId)) return 'FULL';
  return outsiderAccess(game.friendsOnlyLinkPolicy);
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
      {
        organizer: {
          OR: [
            { friendshipsA: { some: { userBId: viewerId } } },
            { friendshipsB: { some: { userAId: viewerId } } },
          ],
        },
      },
    ],
  };
}

module.exports = {
  LINK_POLICIES,
  normalizeLinkPolicy,
  areFriends,
  isGameFriendsOnlyNow,
  getGameAccess,
  getSeriesAccess,
  seriesVisibilityWhere,
};
