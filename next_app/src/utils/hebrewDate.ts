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
