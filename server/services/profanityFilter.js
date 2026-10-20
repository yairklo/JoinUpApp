/**
 * Deterministic check for severe sexual/degrading slurs, used only for private
 * chats where an adult writes to a minor (see chatSafety.js).
 *
 * Ordinary swearing (חרא, shit, fuck, ...) is intentionally NOT here: teens
 * swear and that is not what we moderate. Group/game chats never use this list.
 */

// Bare "כוס" is a cup and is intentionally absent.
const TERMS = [
  'זונה', 'זונות',
  'כוסאמק', 'כוסעמק', 'כוסאמא', 'קוסאמק', 'קוסעמק', 'כוסאומק',
  'שרמוטה', 'שרמוט',
  'בן זונה', 'בת זונה',
  'whore', 'whores',
  'slut', 'sluts',
  'cunt', 'cunts',
  'bitch', 'bitches',
  'zona',
];

function escapeChar(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Letters of the term, allowing spaces / punctuation stuffed between them. */
function termToPattern(term) {
  const chars = [...term.normalize('NFKC').toLowerCase()];
  const body = chars.map((ch) => escapeChar(ch)).join('[\\s._*\\-]*');
  return `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`;
}

const SLUR_RE = new RegExp(TERMS.map(termToPattern).join('|'), 'iu');

function normalizeForProfanity(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

function containsSevereSlur(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return SLUR_RE.test(normalizeForProfanity(text));
}

module.exports = { containsSevereSlur, normalizeForProfanity };
