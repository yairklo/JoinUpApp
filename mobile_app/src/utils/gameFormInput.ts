// Parsing/formatting for the numeric fields of the game forms (create, edit, group settings).
// The API contract is unchanged: `duration` is hours as a number (Float), `price` is whole shekels (Int).

export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 6 * 60;
export const DURATION_STEP_MINUTES = 15;

/** Hours (2.5) -> "2:30". Returns '' for a non-positive or non-finite value. */
export function formatDurationHM(hours: number): string {
    if (!Number.isFinite(hours) || hours <= 0) return '';
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * "2:30" -> 2.5. Also accepts plain or decimal hours ("2", "2.5", "2,5").
 * Returns null for anything else (empty, negative, minutes >= 60, zero length).
 */
export function parseDurationHM(input: string): number | null {
    const raw = String(input ?? '').trim();
    const hm = /^(\d{1,2}):([0-5]\d)$/.exec(raw);
    if (hm) {
        const minutes = Number(hm[1]) * 60 + Number(hm[2]);
        return minutes > 0 ? minutes / 60 : null;
    }
    const hours = parseDecimalInput(raw);
    return hours !== null && hours > 0 ? hours : null;
}

/**
 * Picker choices in hours, every 15 minutes from 0:30 to 6:00. A current value that is off the
 * grid (e.g. a group default of 1.1 hours) is merged in so the picker never drops it silently.
 */
export function buildDurationOptions(currentHours?: number | null): number[] {
    const options: number[] = [];
    for (let m = MIN_DURATION_MINUTES; m <= MAX_DURATION_MINUTES; m += DURATION_STEP_MINUTES) {
        options.push(m / 60);
    }
    if (typeof currentHours === 'number' && Number.isFinite(currentHours) && currentHours > 0) {
        const currentMinutes = Math.round(currentHours * 60);
        if (!options.some((o) => Math.round(o * 60) === currentMinutes)) {
            options.push(currentMinutes / 60);
            options.sort((a, b) => a - b);
        }
    }
    return options;
}

/**
 * Non-negative decimal typed by a user. Accepts "." or "," as the separator ("1,5" -> 1.5);
 * Android keypads in a Hebrew/European locale often offer only ",". Returns null when the text
 * is empty or not a plain number ("1.2.3", "abc", "-1", "1e3").
 */
export function parseDecimalInput(input: string): number | null {
    const raw = String(input ?? '').trim().replace(',', '.');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

/**
 * Keeps a whole-number field whole while typing. Text after a decimal separator is dropped
 * instead of merged, so a pasted "12.5" becomes "12" and never "125".
 */
export function sanitizeWholeNumberInput(input: string): string {
    return String(input ?? '').split(/[.,]/)[0].replace(/[^0-9]/g, '');
}
