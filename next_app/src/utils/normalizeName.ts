/**
 * Small display-time normalization for participant/roster names -- does NOT
 * touch the underlying data model (DB values, API payloads, form state).
 * Only used where a name is rendered or compared, so two profiles that are
 * really the same formatting-wise (trailing whitespace, doubled internal
 * spaces from a mixed Hebrew/English alias like "Yair  כהן ") don't read as
 * visually distinct/duplicate-looking entries in a roster list.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ");
}

/** Case-insensitive, whitespace-insensitive equality check for two display names. */
export function namesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}
