// Minimal, dependency-free HTML stripping for free-text fields (game/series titles,
// descriptions, welcome messages, field/venue names) where no markup is ever legitimate.
//
// This is NOT a full HTML sanitizer (it won't, for example, safely allow a curated subset of
// tags). It exists purely to neutralize script/markup injection -- e.g.
// `<script>alert(1)</script><img src=x onerror=alert(2)>` -- for plain-text fields that get
// written to the DB and may later be read by non-React consumers (push notification bodies,
// email digests, etc.) that won't auto-escape the way React's JSX interpolation does.
//
// Sanitize on write (here) rather than relying solely on render-time escaping, since a single
// unsafe consumer anywhere downstream would otherwise reopen the hole.

/**
 * Strips anything that looks like an HTML/XML tag from a string. Non-string input (undefined,
 * null, numbers, etc.) is returned unchanged so callers can wrap optional/nullable fields
 * without extra branching.
 *
 * Runs the tag-strip repeatedly until it reaches a fixed point, so malformed/nested markup
 * like `<<script>script>` (which a single pass would turn back into `<script>`) can't survive.
 */
function stripHtmlTags(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  let prev;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out;
}

/**
 * Truncates a string to `maxLength` characters. Non-string input is returned unchanged.
 */
function capLength(value, maxLength) {
  if (typeof value !== 'string' || typeof maxLength !== 'number') return value;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Combines stripHtmlTags + capLength -- the standard treatment for a free-text field on its
 * way into Prisma. Non-string input (undefined/null) passes through untouched, which matters
 * for callers doing `typeof field !== 'undefined'` checks for partial updates.
 */
function sanitizeFreeText(value, maxLength) {
  return capLength(stripHtmlTags(value), maxLength);
}

module.exports = { stripHtmlTags, capLength, sanitizeFreeText };
