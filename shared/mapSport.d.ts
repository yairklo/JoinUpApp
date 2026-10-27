export type MarkerVisualVariant = 'sport' | 'neutral' | 'empty';
export interface MarkerVisual {
  iconName: string;
  colorHex: string;
  variant: MarkerVisualVariant;
}
export interface FieldSportSource {
  supportedSports?: string[] | null;
}
export const NEUTRAL_MARKER_VISUAL: MarkerVisual;
export const EMPTY_FIELD_MARKER_VISUAL: MarkerVisual;
export function normalizeSportKey(sport?: string | null): string | null;
export function getFieldSportTags(field: FieldSportSource): string[];
export function fieldMatchesSportFilter(field: FieldSportSource, filter: string | null | undefined): boolean;
export function getSportIconName(sport?: string | null): string;
export function getSportColorHex(sport?: string | null): string;
export function getSportMarkerVisual(sport?: string | null): MarkerVisual;
export function getFieldMarkerVisual(field: FieldSportSource): MarkerVisual;
