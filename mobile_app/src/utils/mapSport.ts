/**
 * Shared sport icon + color helpers for map markers (search + game creation).
 */

export type MarkerVisualVariant = 'sport' | 'neutral' | 'empty';

export interface MarkerVisual {
    iconName: string;
    colorHex: string;
    variant: MarkerVisualVariant;
}

export const NEUTRAL_MARKER_VISUAL: MarkerVisual = {
    iconName: 'stadium',
    colorHex: '#64748b',
    variant: 'neutral',
};

export const EMPTY_FIELD_MARKER_VISUAL: MarkerVisual = {
    iconName: 'map-marker-plus',
    colorHex: '#94a3b8',
    variant: 'empty',
};

const SPORT_ICON_MAP: Record<string, string> = {
    SOCCER: 'soccer',
    BASKETBALL: 'basketball',
    TENNIS: 'tennis',
    VOLLEYBALL: 'volleyball',
    PADEL: 'tennis-ball',
};

const SPORT_COLOR_MAP: Record<string, string> = {
    SOCCER: '#16a34a',
    BASKETBALL: '#f97316',
    TENNIS: '#eab308',
    VOLLEYBALL: '#06b6d4',
    PADEL: '#a855f7',
};

function normalizeSportKey(sport?: string): string | null {
    if (!sport) return null;
    const upper = sport.toUpperCase();
    if (SPORT_ICON_MAP[upper]) return upper;

    const lower = sport.toLowerCase();
    if (lower.includes('כדורסל') || lower.includes('basketball')) return 'BASKETBALL';
    if (lower.includes('טניס') || lower.includes('tennis')) return 'TENNIS';
    if (lower.includes('כדורעף') || lower.includes('volleyball')) return 'VOLLEYBALL';
    if (lower.includes('פדל') || lower.includes('padel')) return 'PADEL';
    if (lower.includes('כדורגל') || lower.includes('soccer') || lower.includes('football')) return 'SOCCER';
    return null;
}

function normalizeSupportedSports(supportedSports?: string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const sport of supportedSports || []) {
        const key = normalizeSportKey(sport);
        if (key && !seen.has(key)) {
            seen.add(key);
            normalized.push(key);
        }
    }
    return normalized;
}

/** Sport tags derived solely from venue DB metadata — never from form state. */
export function getFieldSportTags(field: { supportedSports?: string[] }): string[] {
    return normalizeSupportedSports(field.supportedSports);
}

export function fieldMatchesSportFilter(
    field: { supportedSports?: string[] },
    filter: string | null
): boolean {
    if (!filter) return true;
    return getFieldSportTags(field).includes(filter);
}

export function getSportIconName(sport?: string) {
    const key = normalizeSportKey(sport);
    if (!key) return 'map-marker';
    return SPORT_ICON_MAP[key];
}

export function getSportColorHex(sport?: string) {
    const key = normalizeSportKey(sport);
    if (!key) return '#059669';
    return SPORT_COLOR_MAP[key];
}

export function getSportMarkerVisual(sport?: string): MarkerVisual {
    const key = normalizeSportKey(sport);
    if (!key) return NEUTRAL_MARKER_VISUAL;
    return {
        iconName: SPORT_ICON_MAP[key],
        colorHex: SPORT_COLOR_MAP[key],
        variant: 'sport',
    };
}

/**
 * Icon is derived exclusively from the venue's supportedSports DB field.
 * Form/screen sport context is intentionally ignored.
 */
export function getFieldMarkerVisual(field: { supportedSports?: string[] }): MarkerVisual {
    const supported = normalizeSupportedSports(field.supportedSports);

    if (supported.length === 1) {
        return getSportMarkerVisual(supported[0]);
    }

    return NEUTRAL_MARKER_VISUAL;
}
