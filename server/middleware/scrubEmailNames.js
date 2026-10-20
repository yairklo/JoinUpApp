/**
 * Safety net for display names in API responses. Older rows stored the account email in
 * User.name (Clerk's displayName() falls back to it), and several routes spread raw user rows.
 * Any name-like field whose whole value is an email address is replaced with a neutral label,
 * so an email can never be shown as a person's name. `email` fields are left alone, and so is
 * the viewer's own record (profile forms pre-fill from it and would save the label back).
 */
const { isEmailAddress } = require('../utils/publicName');

const NAME_KEYS = new Set(['name', 'senderName', 'displayName', 'fullName', 'userName', 'username']);
const FALLBACK = 'משתמש';
const MAX_DEPTH = 12;

function scrub(value, depth = 0, ownId = null) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (value instanceof Date || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i], depth + 1, ownId);
    return value;
  }
  const isOwnRecord = ownId !== null && value.id === ownId;
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (NAME_KEYS.has(key) && typeof v === 'string') {
      if (!isOwnRecord && isEmailAddress(v)) value[key] = FALLBACK;
    } else if (v && typeof v === 'object') {
      value[key] = scrub(v, depth + 1, ownId);
    }
  }
  return value;
}

/** Express middleware: wraps res.json for non-admin API routes. */
function scrubEmailNames(req, res, next) {
  if (req.path.startsWith('/admin')) return next();
  const json = res.json.bind(res);
  res.json = (body) => json(scrub(body, 0, req.user?.id ? String(req.user.id) : null));
  next();
}

module.exports = { scrubEmailNames, scrub };
