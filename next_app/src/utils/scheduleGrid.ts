import { isoToIsraelParts, israelToIso, minutesToTime, timeToMinutes } from "./tournamentManage";

// Pure layout for the court grid (design spec 11.2 "לוח מגרשים") shared by schedule preview and manual edit.

export interface GridItem {
    /** Match id (committed) or preview key. */
    key: string;
    number: number;
    scheduledAt: string | null;
    court: string | null;
    home: string;
    away: string;
    stage?: string;
    /** Draws the warning border. */
    conflict?: boolean;
}

export interface GridCell {
    item: GridItem;
    /** 0-based court column. */
    col: number;
    /** 0-based first slot row. */
    row: number;
    span: number;
}

export interface Grid {
    courts: string[];
    /** Minutes from midnight of the first row. */
    startMin: number;
    slots: number;
    step: number;
    cells: GridCell[];
}

/**
 * The generator stores unnamed courts as bare numbers ("1") while the editor's court list uses "מגרש 1".
 * Both must land in the same grid column, so bare numbers are shown/matched as "מגרש N".
 */
export function normalizeCourt(label: string | null | undefined): string {
    const t = (label ?? "").trim();
    const m = COURT_NUMBER.exec(t);
    return m ? `מגרש ${Number(m[1])}` : t;
}

const COURT_NUMBER = /^(?:מגרש\s*)?(\d+)$/;

/**
 * Canonical court identity. MUST match `courtKey` in shared/tournament/scheduler.js (the server's conflict check):
 * bare digits and "מגרש N" (any zero padding) are one court; other names compare trimmed and case-insensitive.
 */
export function courtKey(label: unknown): string {
    const t = String(label ?? "").trim().toLowerCase();
    const m = COURT_NUMBER.exec(t);
    return m ? String(Number(m[1])) : t;
}

/** Label to store when a match lands on grid column `target`: keep its stored label when it is already that court. */
export function courtLabelForMove(current: string | null | undefined, target: string): string {
    return current && courtKey(current) === courtKey(target) ? current : target;
}

/** Court names for pickers, one per canonical court ("1" and "מגרש 1" collapse), in first-seen order. */
export function dedupeCourts(labels: Iterable<string>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of labels) {
        const n = normalizeCourt(l);
        const k = courtKey(n);
        if (n && !seen.has(k)) {
            seen.add(k);
            out.push(n);
        }
    }
    return out;
}

const collator = new Intl.Collator("he", { numeric: true });

function gcd(a: number, b: number): number {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) {
        const t = y;
        y = x % y;
        x = t;
    }
    return x || 1;
}

/**
 * Row size for the court grid. A 30-minute step with a 40-minute match rounds the
 * block up to 60 minutes and paints the next match on top of it. The greatest
 * common divisor keeps each block the real length and on its real start minute.
 */
export function gridStep(step: number, durationMinutes: number): number {
    const s = Math.max(5, Math.round(step) || 5);
    const d = Math.max(1, Math.round(durationMinutes) || 1);
    const g = gcd(s, d);
    return g >= 5 ? g : s;
}

export function itemDays(items: ReadonlyArray<Pick<GridItem, "scheduledAt">>): string[] {
    const days = new Set<string>();
    for (const it of items) {
        const p = it.scheduledAt ? isoToIsraelParts(it.scheduledAt) : null;
        if (p) days.add(p.date);
    }
    return [...days].sort();
}

export function unscheduled(items: ReadonlyArray<GridItem>): GridItem[] {
    return items.filter((it) => !it.scheduledAt || !isoToIsraelParts(it.scheduledAt));
}

/**
 * Court-by-time grid for one day. Rows are `step`-minute slots; a match spans `ceil(duration / step)` rows starting at its
 * slot. `extraCourts` keeps empty columns (a drop target) for courts that have no match that day.
 */
export function buildGrid(
    items: ReadonlyArray<GridItem>,
    day: string,
    opts: { step: number; durationMinutes: number; extraCourts?: ReadonlyArray<string> }
): Grid {
    const step = gridStep(opts.step, opts.durationMinutes);
    const span = Math.max(1, Math.ceil(opts.durationMinutes / step));
    const dayItems: Array<{ item: GridItem; min: number }> = [];
    for (const item of items) {
        const p = item.scheduledAt ? isoToIsraelParts(item.scheduledAt) : null;
        if (!p || p.date !== day) continue;
        const min = timeToMinutes(p.time);
        if (min !== null) dayItems.push({ item, min });
    }
    const display = new Map<string, string>(); // court key -> first-seen display name
    for (const c of opts.extraCourts ?? []) if (!display.has(courtKey(c))) display.set(courtKey(c), normalizeCourt(c));
    for (const { item } of dayItems) if (!display.has(courtKey(item.court))) display.set(courtKey(item.court), normalizeCourt(item.court));
    const courts = [...display.values()].sort((a, b) => collator.compare(a, b));
    if (dayItems.length === 0) return { courts, startMin: 8 * 60, slots: 8, step, cells: [] };
    const first = Math.floor(Math.min(...dayItems.map((d) => d.min)) / step) * step;
    const last = Math.max(...dayItems.map((d) => d.min));
    const slots = Math.floor((last - first) / step) + span + 1;
    const cells = dayItems.map(({ item, min }) => ({
        item,
        col: courts.indexOf(display.get(courtKey(item.court)) as string),
        row: Math.floor((min - first) / step),
        span,
    }));
    return { courts, startMin: first, slots, step, cells };
}

/** ISO instant for a grid cell (Israel wall-clock), or null past midnight. */
export function cellToIso(day: string, grid: Pick<Grid, "startMin" | "step">, row: number): string | null {
    const min = grid.startMin + row * grid.step;
    if (min < 0 || min >= 24 * 60) return null;
    return israelToIso(day, minutesToTime(min));
}

/** Items whose block would overlap a drop at `court`/`row` (excluding the dragged item). Drives green / amber highlight. */
export function cellOccupants(grid: Grid, court: number, row: number, span: number, ignoreKey?: string): GridCell[] {
    return grid.cells.filter(
        (c) => c.item.key !== ignoreKey && c.col === court && c.row < row + span && row < c.row + c.span
    );
}
