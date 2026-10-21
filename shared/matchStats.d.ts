export type StatSport = 'SOCCER' | 'BASKETBALL' | 'TENNIS';
export type ResultOutcome = 'WIN' | 'LOSS' | 'DRAW';

export interface StatDef {
  key: string;
  en: string;
  he: string;
  /** Sanity cap (inclusive). */
  max: number;
  /** Shown in the profile summary. */
  summary: boolean;
}

export interface StatError {
  code:
    | 'UNKNOWN_SPORT' | 'INVALID_STATS' | 'UNKNOWN_KEY' | 'NOT_INT' | 'NEGATIVE' | 'TOO_LARGE'
    | 'INVALID_RESULT' | 'INVALID_SCORES'
    | 'INVALID_BEST_OF' | 'NO_SETS' | 'TOO_MANY_SETS' | 'INVALID_SET' | 'SETS_AFTER_MATCH_END'
    | 'INVALID_SET_SCORE' | 'MATCH_INCOMPLETE';
  key?: string;
  index?: number;
  max?: number;
}

export const STAT_DEFS: Record<StatSport, StatDef[]>;
export const MAX_TEAM_SCORE: { SOCCER: number; BASKETBALL: number };

/** Ordered (display order) stat definitions for a sport; [] if unknown. */
export function getStatDefs(sport: string): StatDef[];
export function getStatKeys(sport: string): string[];
export function getSummaryKeys(sport: string): string[];
/** Label for a stat key; falls back to the key itself. */
export function getStatLabel(sport: string, key: string, lang?: 'he' | 'en'): string;

export interface ValidateStatsResult {
  valid: boolean;
  errors: StatError[];
  /** Only the valid entries. */
  stats: Record<string, number>;
}
export function validateStats(sport: string, values: unknown): ValidateStatsResult;

export function deriveOutcome(sideScore: number, otherScore: number): ResultOutcome;

export type TennisSets = Array<[number, number]>;
export interface TennisSetsResult {
  valid: boolean;
  errors: StatError[];
  setsWon: [number, number];
  /** Match tiebreak points are not counted as games. */
  gamesWon: [number, number];
  winner: 0 | 1 | null;
}
export function validateTennisSets(sets: unknown, opts?: { bestOf?: 3 | 5 }): TennisSetsResult;

export interface ValidateResultInput {
  /** Team sports: [home, away]. */
  scores?: unknown;
  /** Tennis: [[a,b], ...]. */
  sets?: unknown;
  bestOf?: 3 | 5;
}
export interface ValidateResultOutput {
  valid: boolean;
  errors: StatError[];
  /** Tennis: sets won per side. */
  scores: number[];
  /** Per side; empty when invalid. */
  outcomes: ResultOutcome[];
  /** Tennis only. */
  setsWon?: [number, number];
  gamesWon?: [number, number];
  winner?: 0 | 1 | null;
}
export function validateResult(sport: string, result: ValidateResultInput): ValidateResultOutput;

export interface PlayerTotalsWarning {
  code: 'PLAYER_SUM_EXCEEDS_SCORE';
  key: 'goals' | 'points';
  sum: number;
  teamScore: number;
}
export function checkPlayerTotals(
  sport: string,
  teamScore: number,
  playerStats: Array<Record<string, number>>
): PlayerTotalsWarning[];

export function aggregateStats(entries: Array<{ key: string; value: number }>): Record<string, number>;
