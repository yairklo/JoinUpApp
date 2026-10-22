import { getStatDefs, getStatLabel, getSummaryKeys } from '@joinup/shared/matchStats';
import type { ResultOutcome, StatValues } from '@/types/matchResult';

/** Binary stats render as a badge, never "label: n". */
const BINARY_KEYS = new Set(['cleanSheet', 'mvp']);

export const OUTCOME_LETTER_HE: Record<ResultOutcome, string> = { WIN: 'נ', DRAW: 'ת', LOSS: 'ה' };
export const OUTCOME_LABEL_HE: Record<ResultOutcome, string> = { WIN: 'ניצחון', DRAW: 'תיקו', LOSS: 'הפסד' };

/** Split the API's "mine-theirs" score; null when it is not two non-negative integers. */
export function parseScore(score: string | null | undefined): [number, number] | null {
    if (!score) return null;
    const m = /^(\d+)-(\d+)$/.exec(score.trim());
    return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Non-zero stat keys in summary-first, then STAT_DEFS order. */
export function orderedStatKeys(sport: string, values: StatValues): string[] {
    const defs = getStatDefs(sport).map((d) => d.key);
    const summary = getSummaryKeys(sport);
    const ordered = [...summary, ...defs.filter((k) => !summary.includes(k))];
    return ordered.filter((k) => (values[k] ?? 0) > 0);
}

/** "2 שערים" / "שער אחד"; binary keys are label only. */
export function formatStatText(sport: string, key: string, value: number): string {
    const label = getStatLabel(sport, key, 'he', value);
    if (key === 'mvp') return `⭐ ${label}`;
    if (BINARY_KEYS.has(key)) return label;
    return `${value} ${label}`;
}

export function formatPerGame(value: number): string {
    return value.toLocaleString('he-IL', { maximumFractionDigits: 1 });
}

/** Rounded win percentage, null when no games with a side. */
export function winRatePct(wins: number, draws: number, losses: number): number | null {
    const total = wins + draws + losses;
    return total > 0 ? Math.round((wins / total) * 100) : null;
}
