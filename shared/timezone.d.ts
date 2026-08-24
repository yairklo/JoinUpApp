export function parseJerusalemTimeToUTC(dateStr: string, timeStr: string): Date;
export function formatJerusalemDate(dateInput?: Date | string | number): string;
export function formatJerusalemTime(dateInput: Date | string | number): string;
export function getJerusalemDayHour(date?: Date): { dayOfWeek: number; hour: number };
export function getActiveGameStartCutoff(): Date;
export function buildActiveGameStartFilter(dateInput?: string | Date | null): { gte: Date; lte?: Date };
export const ACTIVE_GAME_GRACE_MS: number;
