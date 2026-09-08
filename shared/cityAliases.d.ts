export const DEFAULT_CITY: string;
export const CITY_ALIASES: Record<string, string>;
export function normalizeCity(city: string | null | undefined): string;
export function expandCityAliases(city: string | null | undefined): string[];
export function allCityTokensFor(city: string | null | undefined): string[];
export function prismaFieldCityFilter(city: string | null | undefined):
  | { city: { equals: string; mode: 'insensitive' } }
  | { OR: Array<{ city: { equals: string; mode: 'insensitive' } }> }
  | Record<string, never>;
export function sqlCanonicalCityExpr(column: string): string;
