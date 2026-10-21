const { prisma } = require('../lib/prisma');

const VALID_LEVELS = ['EVERYONE', 'FRIENDS_ONLY'];

// Jerusalem-local calendar age (null when no birthDate); shared with clients and the age gate.
const { getAgeInJerusalem, ADULT_AGE } = require('../shared/ageGate');

/**
 * Age-based DEFAULT only (used when a user has not saved an explicit preference).
 * Under ADULT_AGE → FRIENDS_ONLY; adult or unknown age → EVERYONE.
 */
function getDefaultPrivacyForAge(birthDate) {
  const age = getAgeInJerusalem(birthDate);
  if (age === null) return 'EVERYONE';
  return age < ADULT_AGE ? 'FRIENDS_ONLY' : 'EVERYONE';
}

/** True only for a stored birth date that is still under ADULT_AGE. Unknown age is not a minor. */
function isKnownMinor(birthDate) {
  const age = getAgeInJerusalem(birthDate);
  return age !== null && age < ADULT_AGE;
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

/**
 * Age-based default for every privacy field — what each would resolve to if unset.
 * Unlike `resolved`, this never echoes a stored explicit value, so clients can always
 * label the "default" option with its true meaning.
 */
function getAgeDefaults(birthDate) {
  const d = getDefaultPrivacyForAge(birthDate);
  return { privacyFriends: d, privacyGames: d, privacyMessages: d };
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

/**
 * Whether this requester may open a friend request.
 * Friends-only on an adult only hides their friends list — anyone can still ask.
 * A minor on friends-only (the age default, or an explicit choice) still accepts
 * requests from other known minors, so two minors can become friends. Adults and
 * unknown-age accounts stay refused unless that minor chose EVERYONE.
 * This does not look at blocks. Callers must apply the block check first and
 * answer it with an ordinary success, so a blocked sender cannot tell.
 */
function canRequestFriendship({ targetBirthDate, targetPrivacyFriends, requesterBirthDate }) {
  if (!isKnownMinor(targetBirthDate)) return true;
  if (resolvePrivacyLevel(targetPrivacyFriends, targetBirthDate) === 'EVERYONE') return true;
  return isKnownMinor(requesterBirthDate);
}

module.exports = {
  VALID_LEVELS,
  getAgeInJerusalem,
  getDefaultPrivacyForAge,
  resolvePrivacyLevel,
  getAgeDefaults,
  areConfirmedFriends,
  canViewSection,
  isKnownMinor,
  canRequestFriendship,
};
