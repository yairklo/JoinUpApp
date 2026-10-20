/**
 * Deterministic profanity check for chats that include a minor.
 *
 * AI moderation is not enough on its own: OpenAI often misses Hebrew slurs, and
 * the adult→minor prompt used to allow this class of word. Adult-only chats do
 * not call this — see chatSafety.js.
 */

// Strong slurs and swear words. Bare "כוס" is a cup and is intentionally absent.
const TERMS = [
  'זונה', 'זונות',
  'זין', 'זיין', 'מזדיין', 'מזדיינת', 'זדיין', 'תזדיין', 'תזדייני',
  'כוסאמק', 'כוסעמק', 'כוסאמא', 'קוסאמק', 'קוסעמק', 'כוסאומק',
  'שרמוטה', 'שרמוט',
  'מניאק', 'מניאקית',
  'חרא',
  'בן זונה', 'בת זונה',
  'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker',
  'shit', 'shitty', 'bullshit',
  'bitch', 'bitches',
  'whore', 'whores',
  'slut', 'sluts',
  'cunt', 'cunts',
  'asshole', 'assholes',
  'dick', 'dicks',
  'pussy',
  'bastard',
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

const PROFANITY_RE = new RegExp(TERMS.map(termToPattern).join('|'), 'iu');

function normalizeForProfanity(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

function containsProfanity(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return PROFANITY_RE.test(normalizeForProfanity(text));
}

module.exports = { containsProfanity, normalizeForProfanity };
