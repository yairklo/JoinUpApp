export const SPORT_KEYS: string[];
export const SPORT_MAPPING: Record<string, string>;
export const SPORT_EMOJI: Record<string, string>;
export interface SportThemeColors {
  base: string;
  glow: string;
  deep: string;
  ink: string;
  tint: string;
}
export const SPORT_THEME: Record<'SOCCER' | 'BASKETBALL' | 'TENNIS', SportThemeColors>;
export const POSITION_OPTIONS: Record<string, string[]>;
export const HEBREW_SPORT_MAP: Record<string, string>;
export function resolveSportFilters(q: string): string[];
