import {
  SPORT_MAPPING,
  SPORT_EMOJI,
  POSITION_OPTIONS,
} from '@joinup/shared/sports';

export { SPORT_MAPPING, SPORT_EMOJI, POSITION_OPTIONS };

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
