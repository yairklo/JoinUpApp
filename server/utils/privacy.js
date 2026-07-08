const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_LEVELS = ['EVERYONE', 'FRIENDS_ONLY'];

/**
 * Computes a user's age using Jerusalem-local calendar dates on both ends,
 * avoiding UTC drift near midnight / DST boundaries.
 * @param {Date|string|null} birthDate
 * @returns {number|null} age in whole years, or null if no birthDate
 */
function getAgeInJerusalem(birthDate) {
  if (!birthDate) return null;
  const fmt = (d) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  const [ny, nm, nd] = fmt(new Date()).split('-').map(Number);
  const [by, bm, bd] = fmt(new Date(birthDate)).split('-').map(Number);

  let age = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;
  return age;
}

/**
 * Age-based DEFAULT only (used when a user has not saved an explicit preference).
 * Under 18 → FRIENDS_ONLY; 18+ or unknown age → EVERYONE.
 */
function getDefaultPrivacyForAge(birthDate) {
  const age = getAgeInJerusalem(birthDate);
  if (age === null) return 'EVERYONE';
  return age < 18 ? 'FRIENDS_ONLY' : 'EVERYONE';
}

/**
 * Resolves the effective privacy level. A stored value ALWAYS wins; only a
 * null/invalid stored value falls back to the age-based default. This is never
 * a hard override of an explicit user choice.
 */
function resolvePrivacyLevel(stored, birthDate) {
  if (VALID_LEVELS.includes(stored)) return stored;
  return getDefaultPrivacyForAge(birthDate);
}

/** Confirmed friendship check using the ordered-pair unique key. */
async function areConfirmedFriends(userAId, userBId) {
  if (!userAId || !userBId || userAId === userBId) return false;
  const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  const row = await prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId: a, userBId: b } },
  });
  return !!row;
}

/** Section visibility gate. Owner always sees; EVERYONE is public; else friends only. */
function canViewSection({ effectivePrivacy, isOwner, isFriend }) {
  if (isOwner) return true;
  if (effectivePrivacy === 'EVERYONE') return true;
  return !!isFriend;
}

module.exports = {
  VALID_LEVELS,
  getAgeInJerusalem,
  getDefaultPrivacyForAge,
  resolvePrivacyLevel,
  areConfirmedFriends,
  canViewSection,
};
