/**
 * "19.10.2026 • 19:00" from the server's Jerusalem `date` ("YYYY-MM-DD") and `time` ("HH:mm").
 * Parses the string instead of going through Date so the day never shifts with the viewer's timezone.
 */
export function formatHistoryDateTime(date?: string | null, time?: string | null): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
    const d = m ? `${m[3]}.${m[2]}.${m[1]}` : date ?? "";
    return [d, time].filter(Boolean).join(" • ");
}
