import {
  SPORT_MAPPING,
  SPORT_EMOJI,
  SPORT_THEME,
  POSITION_OPTIONS,
} from '@joinup/shared/sports';
import type { SportThemeColors } from '@joinup/shared/sports';

export { SPORT_MAPPING, SPORT_EMOJI, SPORT_THEME, POSITION_OPTIONS };
export type { SportThemeColors };

/** Per-sport identity colors, falling back to soccer for unknown/missing sports. */
export function getSportTheme(sport?: string | null): SportThemeColors {
    return (SPORT_THEME as Record<string, SportThemeColors>)[sport || ""] || SPORT_THEME.SOCCER;
}

export const SPORT_IMAGES = {
    SOCCER: "/images/soccer.jpg",
    BASKETBALL: "/images/basketball.jpg",
    TENNIS: "/images/tennis.jpg"
};

export type SportType = keyof typeof SPORT_IMAGES;
export type SportFilter = SportType | "ALL";

// Resolves a sport filter value to its Hebrew display label, falling back to the raw value
// for anything not in SPORT_MAPPING. Shared so "no results for <sport>" empty-state copy
// doesn't reimplement this fallback independently in every rail component.
export function sportLabel(sportFilter: SportFilter): string {
    return (SPORT_MAPPING as Record<string, string>)[sportFilter] || sportFilter;
}
