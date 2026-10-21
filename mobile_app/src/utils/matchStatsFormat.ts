import { getStatDefs, getSummaryKeys } from '@joinup/shared/matchStats';

const BINARY_KEYS = new Set(['cleanSheet', 'mvp']);

type Lang = 'he' | 'en';

export const toLang = (language?: string): Lang => (language && language.startsWith('en') ? 'en' : 'he');

export const statLabel = (sport: string, key: string, lang: Lang): string => {
    const d = getStatDefs(sport).find((x: { key: string }) => x.key === key);
    if (!d) return key;
    return lang === 'he' ? d.he : d.en;
};

/** "2 שערים", "בישולים: 1" (no singular labels in shared yet), binary keys render the label only, MVP as a star. */
export function formatStatInline(sport: string, key: string, value: number, lang: Lang): string {
    if (key === 'mvp') return '⭐';
    const label = statLabel(sport, key, lang);
    if (BINARY_KEYS.has(key)) return label;
    return value === 1 ? `${label}: 1` : `${value} ${label}`;
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
