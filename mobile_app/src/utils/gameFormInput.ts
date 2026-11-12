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

/** Hours (2.5) -> { hours: 2, minutes: 30 }, rounded to the minute. */
export function splitDuration(hours: number): { hours: number; minutes: number } {
    const totalMinutes = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0;
    return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
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

export interface WholeNumberInputState {
    value: string;
    /** True after a separator keystroke was rejected: digits are ignored until the user deletes. */
    locked: boolean;
}

const SEPARATOR = /[.,]/;

/**
 * Next state of a whole-number text field, given the text the keyboard produced (`next`), the text
 * the field held before (`prev`) and whether a separator was already rejected (`locked`).
 *
 * - A separator typed as a single keystroke is rejected (the value stays whole) and the field locks,
 *   so the digits the user meant as a fraction ("12.5", "1,5") are ignored instead of being
 *   appended to the integer ("125", "15"). Deleting unlocks it.
 * - Multi-character input (a paste) keeps the integer part before the separator. With
 *   `allowThousands`, "1,000" / "1,000,000" is read as a thousands separator instead.
 */
export function nextWholeNumberInput(
    next: string,
    prev: string,
    locked: boolean,
    opts: { allowThousands?: boolean } = {},
): WholeNumberInputState {
    const text = String(next ?? '');
    const before = String(prev ?? '');
    const integerPart = (s: string) => s.split(SEPARATOR)[0].replace(/[^0-9]/g, '');

    if (text.length < before.length) {
        return { value: integerPart(text), locked: false };
    }

    const inserted = text.length - before.length;
    if (inserted > 1 || (before === '' && text.length > 1)) {
        const trimmed = text.trim();
        if (opts.allowThousands && /^\d{1,3}(,\d{3})+$/.test(trimmed)) {
            return { value: trimmed.replace(/,/g, ''), locked: false };
        }
        return { value: integerPart(text), locked: false };
    }

    if (SEPARATOR.test(text)) return { value: before, locked: true };

    const digits = text.replace(/[^0-9]/g, '');
    if (digits === before) return { value: before, locked };
    if (locked) return { value: before, locked: true };
    return { value: digits, locked: false };
}
