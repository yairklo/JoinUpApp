import { getStatDefs, getStatLabel } from '@joinup/shared/matchStats';
import { getSportTheme } from '@/components/ui/SportCover';
import type { GameResultSide } from '@/types/results';
import type { Team } from '@/types/game';

export type Lang = 'he' | 'en';
export type Outcome = 'WIN' | 'DRAW' | 'LOSS' | null;

/** Outcome pill tokens (spec 1.2). Loss is neutral grey, never red. */
export const OUTCOME_CLASSES: Record<'WIN' | 'DRAW' | 'LOSS', { bg: string; text: string }> = {
    WIN: { bg: 'bg-brand-mist dark:bg-brand-ink', text: 'text-brand-dark dark:text-brand-light' },
    DRAW: { bg: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300' },
    LOSS: { bg: 'bg-gray-100 dark:bg-cyber-border', text: 'text-gray-600 dark:text-cyber-muted' },
};

export const BINARY_STAT_KEYS = ['cleanSheet', 'mvp'];

export const sportAccent = getSportTheme;

export function toLang(language?: string): Lang {
    return language?.startsWith('he') ? 'he' : 'en';
}

/** Swatch colour: team colour, else sport base for side A and neutral grey for side B. */
export function sideSwatchColor(side: { order: number; teamId: string | null }, teams: Team[] | undefined, sport: string): string {
    const team = side.teamId ? teams?.find((x) => x.id === side.teamId) : undefined;
    if (team?.color) return team.color;
    return side.order === 0 ? getSportTheme(sport).base : '#9ca3af';
}

/** Non-zero stats in STAT_DEFS order as display strings; value 1 uses the singular label. MVP/cleanSheet are badges. */
export function describeStats(sport: string, values: Record<string, number>, lang: Lang): { key: string; text: string }[] {
    const out: { key: string; text: string }[] = [];
    for (const def of getStatDefs(sport)) {
        const v = values[def.key];
        if (!v || v <= 0) continue;
        const label = getStatLabel(sport, def.key, lang, v);
        if (BINARY_STAT_KEYS.includes(def.key)) {
            out.push({ key: def.key, text: def.key === 'mvp' ? `⭐ ${label}` : label });
        } else {
            out.push({ key: def.key, text: `${v} ${label}` });
        }
    }
    // MVP last
    return [...out.filter((s) => s.key !== 'mvp'), ...out.filter((s) => s.key === 'mvp')];
}

export function winnerOf(sides: GameResultSide[]): GameResultSide | null {
    return sides.find((s) => s.outcome === 'WIN') ?? null;
}

export function formatShortDate(iso: string | null | undefined, lang: Lang): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'numeric' });
}

export const tabular = { fontVariant: ['tabular-nums' as const] };
