// Age gate + terms acceptance rules, shared by server (vendored), web and mobile.
// The server is the authority: clients render whatever status GET /api/users/me returns.

/** Minimum age to use the service at all. */
const MIN_AGE = 13;
/** Users under this age must declare guardian consent. */
const ADULT_AGE = 18;
/**
 * Version of the Terms of Use + Privacy Policy users accept. Bump it (with the
 * texts in legal.js) whenever the documents change materially: every user is then
 * asked to accept again, and minors to re-declare guardian consent.
 */
const LEGAL_VERSION = '2026-10-18';

const AGE_GATE_STATUS = {
  OK: 'OK',
  NEEDS_BIRTHDATE: 'NEEDS_BIRTHDATE',
  UNDER_MIN_AGE: 'UNDER_MIN_AGE',
  NEEDS_TERMS: 'NEEDS_TERMS',
  NEEDS_GUARDIAN_CONSENT: 'NEEDS_GUARDIAN_CONSENT',
};

function jerusalemYmd(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return parts.split('-').map(Number);
}

/**
 * Age in whole years using Jerusalem-local calendar dates on both ends.
 * @returns {number|null} null when birthDate is missing or invalid
 */
function getAgeInJerusalem(birthDate, now = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const [ny, nm, nd] = jerusalemYmd(now);
  const [by, bm, bd] = jerusalemYmd(b);
  let age = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;
  return age;
}

/**
 * @param {{ birthDate?: Date|string|null, termsAcceptedAt?: Date|string|null,
 *           termsVersion?: string|null, guardianConsentAt?: Date|string|null }} user
 */
function getAgeGateStatus(user, now = new Date()) {
  const age = getAgeInJerusalem(user && user.birthDate, now);
  if (age === null) return AGE_GATE_STATUS.NEEDS_BIRTHDATE;
  if (age < MIN_AGE) return AGE_GATE_STATUS.UNDER_MIN_AGE;
  if (!user.termsAcceptedAt || user.termsVersion !== LEGAL_VERSION) return AGE_GATE_STATUS.NEEDS_TERMS;
  if (age < ADULT_AGE && !user.guardianConsentAt) return AGE_GATE_STATUS.NEEDS_GUARDIAN_CONSENT;
  return AGE_GATE_STATUS.OK;
}

/** Sanity bounds for a typed birth date (not in the future, not absurdly old). */
function isPlausibleBirthDate(birthDate, now = new Date()) {
  const age = getAgeInJerusalem(birthDate, now);
  return age !== null && age >= 0 && age <= 120 && new Date(birthDate).getTime() <= now.getTime();
}

module.exports = {
  MIN_AGE,
  ADULT_AGE,
  LEGAL_VERSION,
  AGE_GATE_STATUS,
  getAgeInJerusalem,
  getAgeGateStatus,
  isPlausibleBirthDate,
};
