/**
 * Safety net for display names in API responses. Older rows stored the account email in
 * User.name (Clerk's displayName() falls back to it), and several routes spread raw user rows.
 * Any name-like field whose whole value is an email address is replaced with a neutral label,
 * so an email can never be shown as a person's name. `email` fields are left alone.
 */
const { isEmailAddress } = require('../utils/publicName');

const NAME_KEYS = new Set(['name', 'senderName', 'displayName', 'fullName', 'userName', 'username']);
const FALLBACK = 'משתמש';
const MAX_DEPTH = 12;

function scrub(value, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i], depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (NAME_KEYS.has(key) && typeof v === 'string') {
      if (isEmailAddress(v)) value[key] = FALLBACK;
    } else if (v && typeof v === 'object') {
      value[key] = scrub(v, depth + 1);
    }
  }
  return value;
}

/** Express middleware: wraps res.json for non-admin API routes. */
function scrubEmailNames(req, res, next) {
  if (req.path.startsWith('/admin')) return next();
  const json = res.json.bind(res);
  res.json = (body) => json(scrub(body));
  next();
}

module.exports = { scrubEmailNames, scrub };
