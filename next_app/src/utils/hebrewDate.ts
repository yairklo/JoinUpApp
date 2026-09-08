/** Hebrew display for an ISO `YYYY-MM-DD` value; native date inputs stay ISO under the hood. */
export function formatHebrewDate(iso?: string | null): string {
  if (!iso) return "בחר תאריך";
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "בחר תאריך";
  return parsed.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export const HEBREW_DATE_INPUT_PROPS = {
  lang: "he-IL",
} as const;
