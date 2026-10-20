/**
 * Cheap, deterministic pre-gate in front of AI moderation. AI is only worth
 * paying for when a message carries a grooming / threat / sexual signal, so the
 * vast majority of ordinary chat ("מגיע ב-8") never reaches it.
 *
 * Over-matching only costs one extra AI call; the signals are deliberately broad.
 */
const { normalizeForProfanity, containsSevereSlur } = require('./profanityFilter');

const SIGNALS = [
  // Moving to another platform / contact details
  /וו?אטס?אפ|ווצאפ|וואצאפ|סנאפ|סנפ|אינסט|טלגרם|דיסקורד|טיקטוק|whats\s*app|snap|insta|telegram|discord|tiktok|\bkik\b|\bdm\b/u,
  /\d[\d\s\-.]{6,}\d/u,
  /https?:\/\/|www\.|t\.me\/|@\w{3,}/u,
  /בפרטי|מספר\s*(טלפון|שלך)|תן\s*לי\s*(את\s*)?(ה)?מספר/u,
  // Photos, secrecy, meeting, personal info
  /תמונ|סלפי|עירום|בלי\s*בגדים|nudes?|\bpics?\b|photo|selfie/u,
  /סוד|אל\s*תספר|אל\s*תגיד|לא\s*לספר|בינינו|secret|don'?t\s*tell/u,
  /ניפגש|נפגש|להיפגש|בוא\s*אליי|אצלי|כתובת|איפה\s*אתה\s*גר|איפה\s*את\s*גרה|meet\s*(me|up)|address|where\s*do\s*you\s*live/u,
  /בן\s*כמה|בת\s*כמה|how\s*old|לבד\s*בבית|home\s*alone|הורים/u,
  // Sexual content
  /סקס|מיני|נשיק|לשכב|מציצ|porn|\bsex|kiss|horny/u,
  // Threats / self-harm
  /אהרוג|תמות|להרוג|התאבד|לרצוח|kill|suicide|\bdie\b/u,
  // Affectionate overtures
  /מתוקה|מתוק\s*שלי|אהובה|אהוב\s*שלי|חמודה|sweetheart|babe\b/u,
];

/** @returns {boolean} true when the message should be sent to AI moderation */
function needsAiReview(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const t = normalizeForProfanity(text);
  return containsSevereSlur(text) || SIGNALS.some((re) => re.test(t));
}

module.exports = { needsAiReview };
