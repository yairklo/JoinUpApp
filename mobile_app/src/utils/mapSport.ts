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

export function getSportIconName(sport?: string) {
    const key = normalizeSportKey(sport);
    if (!key) return 'map-marker';
    return SPORT_ICON_MAP[key];
}

export function getSportColorHex(sport?: string) {
    const key = normalizeSportKey(sport);
    if (!key) return '#2563eb';
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
 * Dedicated single-sport venues get a sport icon.
 * Multi-sport / unknown venues get a neutral stadium badge.
 */
export function getFieldMarkerVisual(
    field: { supportedSports?: string[] },
    preferredSport?: string
): MarkerVisual {
    const supported = normalizeSupportedSports(field.supportedSports);

    if (supported.length === 1) {
        return getSportMarkerVisual(supported[0]);
    }

    if (supported.length > 1) {
        return NEUTRAL_MARKER_VISUAL;
    }

    // No DB sport metadata — stay neutral even if the form has a preferred sport.
    if (preferredSport && normalizeSportKey(preferredSport)) {
        return NEUTRAL_MARKER_VISUAL;
    }

    return NEUTRAL_MARKER_VISUAL;
}

/** @deprecated Use getFieldMarkerVisual for venue pins. */
export function resolveFieldSport(field: { supportedSports?: string[] }, preferredSport?: string) {
    const supported = normalizeSupportedSports(field.supportedSports);
    if (supported.length === 1) return supported[0];
    if (preferredSport && supported.includes(normalizeSportKey(preferredSport) || '')) {
        return preferredSport.toUpperCase();
    }
    return supported[0] || preferredSport || undefined;
}
