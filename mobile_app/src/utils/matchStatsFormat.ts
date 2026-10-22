import { getStatDefs, getStatLabel, getSummaryKeys } from '@joinup/shared/matchStats';

const BINARY_KEYS = new Set(['cleanSheet', 'mvp']);

type Lang = 'he' | 'en';

export const toLang = (language?: string): Lang => (language && language.startsWith('en') ? 'en' : 'he');

/** Label for a stat key; pass the count so 1 renders the singular form where one exists. */
export const statLabel = (sport: string, key: string, lang: Lang, count?: number): string =>
    getStatLabel(sport, key, lang, count);

/** "2 שערים", "שער אחד"-style singular for 1, binary keys render the label only, MVP as a star. */
export function formatStatInline(sport: string, key: string, value: number, lang: Lang): string {
    if (key === 'mvp') return '⭐';
    if (BINARY_KEYS.has(key)) return statLabel(sport, key, lang);
    const label = statLabel(sport, key, lang, value);
    return `${value} ${label}`;
}

/** Non-zero keys of `values`: summary keys first, then the rest, both in STAT_DEFS order. */
export function orderedNonZeroKeys(sport: string, values: Record<string, number>): string[] {
    const defs: { key: string }[] = getStatDefs(sport);
    const summary = new Set<string>(getSummaryKeys(sport));
    const keys = defs.map((d) => d.key).filter((k) => (values[k] ?? 0) > 0);
    return [...keys.filter((k) => summary.has(k)), ...keys.filter((k) => !summary.has(k))];
}

export const formatPerGame = (value: number, lang: Lang): string =>
    value.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: 1 });
