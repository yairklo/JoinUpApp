/** Hebrew display for an ISO `YYYY-MM-DD` value; native date inputs stay ISO under the hood. */
export function toIsoDateInput(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (iso) return iso[1];
  const dmy = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return "";
}

function parseNoon(iso: string): Date | null {
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatHebrewDate(iso?: string | null): string {
  const normalized = toIsoDateInput(iso);
  if (!normalized) return "בחר תאריך";
  const parsed = parseNoon(normalized);
  if (!parsed) return "בחר תאריך";
  return parsed.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Compact he-IL numeric date for cards (`9.9.2026`), from ISO or DD/MM/YYYY. */
export function formatHebrewDateShort(value?: string | null): string {
  const normalized = toIsoDateInput(value);
  if (!normalized) return value || "";
  const parsed = parseNoon(normalized);
  if (!parsed) return value || "";
  return parsed.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export const HEBREW_DATE_INPUT_PROPS = {
  lang: "he-IL",
} as const;

/**
 * Friendly card date: "היום" / "מחר" for the next two days, otherwise a short weekday plus
 * day.month ("יום ה׳ · 23.10"). Accepts ISO or DD/MM/YYYY like the other helpers; returns
 * the raw value when it can't be parsed. `todayIso` is injectable for tests.
 */
export function formatHebrewDateRelative(value?: string | null, todayIso?: string): string {
  const normalized = toIsoDateInput(value);
  if (!normalized) return value || "";
  const parsed = parseNoon(normalized);
  if (!parsed) return value || "";
  const today =
    todayIso ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const todayDate = parseNoon(today);
  if (todayDate) {
    const diffDays = Math.round((parsed.getTime() - todayDate.getTime()) / 86_400_000);
    if (diffDays === 0) return "היום";
    if (diffDays === 1) return "מחר";
  }
  const weekday = parsed.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short" });
  return `${weekday} · ${parsed.getDate()}.${parsed.getMonth() + 1}`;
}
