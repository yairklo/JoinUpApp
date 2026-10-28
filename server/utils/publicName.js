/**
 * Names safe to show to someone else. Clerk's displayName() falls back to the
 * account email, and older rows stored that email in User.name. Notifications
 * must never render either one.
 */

const CLERK_ID_RE = /^user_[A-Za-z0-9]+$/;

/** True when the whole string is an email address. */
function isEmailAddress(value) {
  if (typeof value !== 'string') return false;
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.trim());
}

/**
 * A display name other people may see.
 * Returns `fallback` for blank, email-shaped, or raw Clerk ids.
 * Pass `fallback = null` to detect "no usable name" without substituting.
 */
function publicDisplayName(raw, fallback = 'משתמש') {
  if (typeof raw !== 'string') return fallback;
  const name = raw.trim();
  if (!name || name.includes('@') || isEmailAddress(name) || CLERK_ID_RE.test(name)) return fallback;
  return name;
}

/** Copy of a {id,name,imageUrl} user projection that is safe to show to others. */
function publicUser(user, fallback = 'משתמש') {
  if (!user || typeof user !== 'object') return user;
  return { ...user, name: publicDisplayName(user.name, fallback) };
}

function replaceEmails(value, replacement) {
  if (typeof value !== 'string' || !value.includes('@')) return value;
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement);
}

/**
 * Prefer the stored profile name. Fall back to a non-email inline name
 * (first/last name already mapped onto the auth user), then `fallback`.
 */
async function notificationName(prisma, userLike, fallback = 'משתמש') {
  const id = userLike && typeof userLike === 'object'
    ? userLike.id
    : (typeof userLike === 'string' ? userLike : null);
  const inline = userLike && typeof userLike === 'object' ? userLike.name : null;

  let stored = null;
  if (id && prisma?.user?.findUnique) {
    try {
      const row = await prisma.user.findUnique({
        where: { id: String(id) },
        select: { name: true },
      });
      stored = row?.name ?? null;
    } catch {
      stored = null;
    }
  }

  const fromStore = publicDisplayName(stored, null);
  if (fromStore) return fromStore;
  const fromInline = publicDisplayName(inline, null);
  if (fromInline && fromInline !== id) return fromInline;
  return fallback;
}

function payloadHasEmail(title, body, data) {
  if (typeof title === 'string' && title.includes('@')) return true;
  if (typeof body === 'string' && body.includes('@')) return true;
  if (!data || typeof data !== 'object') return false;
  return Object.values(data).some((v) => typeof v === 'string' && v.includes('@'));
}

/**
 * Last line of defense for every notification channel (in-app row, socket, push).
 * Any email in the title, body, or string data fields is replaced with the
 * actor's public name, or 'משתמש' when they have none.
 */
async function redactNotificationFields(prisma, title, body, data = {}) {
  const next = data && typeof data === 'object' ? { ...data } : {};
  if (!payloadHasEmail(title, body, next)) return { title, body, data: next };

  const actor = {
    id: next.actorId || next.requesterId || next.adderId || next.senderId || null,
  };
  const resolved = await notificationName(prisma, actor.id ? actor : null, null);
  const name = resolved || 'משתמש';
  // The English copy must not get the Hebrew fallback word.
  const nameEn = resolved || 'Someone';
  const scrubbed = {};
  for (const [key, value] of Object.entries(next)) {
    if (key === 'email') continue;
    scrubbed[key] = replaceEmails(value, key === 'titleEn' || key === 'bodyEn' ? nameEn : name);
  }
  return {
    title: replaceEmails(title, name),
    body: replaceEmails(body, name),
    data: scrubbed,
  };
}

/**
 * Serve-time scrub for a stored notification row. Old rows were written before
 * names were redacted; replace any email token with `משתמש` without a lookup.
 */
function scrubNotificationRecord(row, replacement = 'משתמש') {
  if (!row || typeof row !== 'object') return row;
  const data = row.data;
  let nextData = data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    nextData = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'email') continue;
      nextData[key] = replaceEmails(value, replacement);
    }
  }
  return {
    ...row,
    title: replaceEmails(row.title, replacement),
    body: replaceEmails(row.body, replacement),
    data: nextData,
  };
}

module.exports = {
  isEmailAddress,
  publicDisplayName,
  publicUser,
  notificationName,
  redactNotificationFields,
  replaceEmails,
  scrubNotificationRecord,
};
