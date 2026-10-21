const CLERK_ID_RE = /^user_[A-Za-z0-9]+$/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** A name safe to put on an avatar or in a notification. Emails and Clerk ids become `fallback`. */
export function publicDisplayName(raw: unknown, fallback = "משתמש"): string {
  if (typeof raw !== "string") return fallback;
  const name = raw.trim();
  if (!name || name.includes("@") || CLERK_ID_RE.test(name)) return fallback;
  return name;
}

/** First candidate that is a real display name. An email is skipped, not chosen. */
export function firstPublicName(candidates: unknown[], fallback = "משתמש"): string {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const name = candidate.trim();
    if (!name || name.includes("@") || CLERK_ID_RE.test(name)) continue;
    return name;
  }
  return fallback;
}

export function replaceEmails(value: string, replacement = "משתמש"): string {
  if (!value || !value.includes("@")) return value;
  return value.replace(EMAIL_RE, replacement);
}
