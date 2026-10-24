// Members vs guests in a group (GameSeries).
//
// A group with `membersOnlyPriority` gives its members (SeriesParticipant rows, plus the
// organizer / admins / game managers) the early registration window (Game.registrationOpensAt).
// Everyone else is a guest: they may register only from Game.guestRegistrationOpensAt, and the
// organizer's friends are NOT insiders unless they are members. Joining the group itself as a
// non-member goes through the manager-approved SeriesJoinRequest flow (routes/series.js).
//
// Window order: registrationOpensAt (members, A) <= guestRegistrationOpensAt (guests, B).

const HOUR_MS = 3600000;

function isValidGuestOpenHours(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** guestRegistrationOpensAt for one of the group's games: `guestRegistrationOpenHours` before start. */
function resolveGuestRegistrationOpensAt(series, gameStart) {
  if (!series || !series.membersOnlyPriority || !isValidGuestOpenHours(series.guestRegistrationOpenHours)) {
    return null;
  }
  const start = new Date(gameStart);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() - series.guestRegistrationOpenHours * HOUR_MS);
}

/** A <= B. A missing side never conflicts (no members window yet, or guests open with members). */
function isGuestWindowOrderValid(membersOpensAt, guestOpensAt) {
  if (!membersOpensAt || !guestOpensAt) return true;
  return new Date(membersOpensAt).getTime() <= new Date(guestOpensAt).getTime();
}

/**
 * Is the viewer an insider of this game (gets the members window)? Organizer, admin, the game's
 * managers and group members. Friendship alone never counts.
 */
async function isGameInsider(prisma, game, viewerId, { isAdmin = false } = {}) {
  if (isAdmin) return true;
  if (!viewerId) return false;
  if (game.organizerId === viewerId) return true;
  const [role, member] = await Promise.all([
    Array.isArray(game.roles)
      ? game.roles.some((r) => r.userId === viewerId)
      : prisma.gameRole.findFirst({ where: { gameId: game.id, userId: viewerId }, select: { id: true } }),
    game.seriesId
      ? prisma.seriesParticipant.findUnique({
          where: { seriesId_userId: { seriesId: game.seriesId, userId: viewerId } },
          select: { id: true },
        })
      : null,
  ]);
  return !!(role || member);
}

/** True while a guest may not register yet (the members-only head start is still running). */
function isGuestWindowClosed(game, now = new Date()) {
  if (!game.membersOnlyPriority || !game.guestRegistrationOpensAt) return false;
  return now < new Date(game.guestRegistrationOpensAt);
}

/** Members hear the normal welcome message, guests their own (falling back to the shared one). */
function pickWelcomeMessage(game, isInsider) {
  if (!isInsider && game.membersOnlyPriority && game.guestWelcomeMessage) return game.guestWelcomeMessage;
  return game.welcomeMessage || null;
}

/**
 * The Game columns a members/guests config produces for a game starting at `start`.
 * `cfg` is a group-shaped object (membersOnlyPriority, guestRegistrationOpenHours, guest* texts);
 * `explicitOpensAt` is a per-game override that wins over the hours offset.
 */
function guestGameData(cfg, start, explicitOpensAt) {
  const on = !!cfg && !!cfg.membersOnlyPriority;
  const explicit = explicitOpensAt ? new Date(explicitOpensAt) : null;
  return {
    membersOnlyPriority: on,
    guestRegistrationOpensAt: on ? (explicit || resolveGuestRegistrationOpensAt(cfg, start)) : null,
    guestWelcomeMessage: cfg?.guestWelcomeMessage || null,
    guestDescription: cfg?.guestDescription || null,
    guestPrice: Number.isInteger(cfg?.guestPrice) ? cfg.guestPrice : null,
  };
}

module.exports = {
  guestGameData,
  isValidGuestOpenHours,
  resolveGuestRegistrationOpensAt,
  isGuestWindowOrderValid,
  isGameInsider,
  isGuestWindowClosed,
  pickWelcomeMessage,
};
