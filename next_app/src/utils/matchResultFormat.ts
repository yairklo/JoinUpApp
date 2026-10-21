import { getStatDefs } from '@joinup/shared/matchStats';
import type { ResultOutcome } from '@joinup/shared/matchStats';
import type { GameResultData, GameResultPlayerStats, GameResultSide, StatValues } from '@/types/matchResult';

/** Keys that render as a badge, not a number (max 1). */
export const BINARY_STAT_KEYS = ['cleanSheet', 'mvp'];

export const OUTCOME_LABEL_HE: Record<ResultOutcome, string> = { WIN: 'ניצחון', DRAW: 'תיקו', LOSS: 'הפסד' };

/** Non-zero stats in STAT_DEFS order as text parts: "2 שערים", "בישולים: 1", "⭐ שחקן המשחק". */
export function formatStatParts(sport: string, values: StatValues | null | undefined): string[] {
    const parts: string[] = [];
    for (const d of getStatDefs(sport)) {
        const v = values?.[d.key] ?? 0;
        if (!(v > 0)) continue;
        if (d.key === 'mvp') continue;
        if (BINARY_STAT_KEYS.includes(d.key)) parts.push(d.he);
        else parts.push(v === 1 ? `${d.he}: 1` : `${v} ${d.he}`);
    }
    if ((values?.mvp ?? 0) > 0) parts.push('⭐ שחקן המשחק');
    return parts;
}

export interface StatGroup {
    key: string;
    side: GameResultSide | null;
    rows: GameResultPlayerStats[];
}

/** A, then B, then unassigned (only when non-empty). Rows with no non-zero value are dropped. */
export function groupStatsBySide(result: GameResultData): StatGroup[] {
    const sides = [...result.sides].sort((a, b) => a.order - b.order);
    const hasValue = (r: GameResultPlayerStats) => Object.values(r.values || {}).some((v) => v > 0);
    const groups: StatGroup[] = sides.map((side) => ({
        key: side.id,
        side,
        rows: result.stats.filter((r) => r.sideId === side.id && hasValue(r)),
    }));
    const known = new Set(sides.map((s) => s.id));
    const loose = result.stats.filter((r) => (!r.sideId || !known.has(r.sideId)) && hasValue(r));
    if (loose.length) groups.push({ key: 'none', side: null, rows: loose });
    return groups.filter((g) => g.rows.length > 0);
}

/** Winning side of a two-sided result, or null for a draw / unknown. */
export function winnerOf(sides: GameResultSide[]): GameResultSide | null {
    return sides.find((s) => s.outcome === 'WIN') ?? null;
}

export function scoreAriaLabel(sides: GameResultSide[]): string {
    const [a, b] = [...sides].sort((x, y) => x.order - y.order);
    if (!a || !b) return '';
    const winner = winnerOf(sides);
    if (!winner) return `תיקו ${a.score}–${b.score}`;
    return `${a.label} ${a.score}, ${b.label} ${b.score}. ניצחון ל${winner.label}`;
}
