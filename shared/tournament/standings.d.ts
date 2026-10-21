import type { Seed } from './rng';

export type TiebreakCriterion =
  | 'HEAD_TO_HEAD'
  | 'GOAL_DIFFERENCE'
  | 'GOALS_FOR'
  | 'WINS'
  | 'FAIR_PLAY'
  | 'DRAW_LOT';

export interface StandingsMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number | null;
  awayScore?: number | null;
  /** Only 'FINISHED' and 'FORFEIT' are counted; anything else is ignored. */
  status: string;
  /** For status 'FORFEIT': the team that forfeited. */
  forfeitBy?: string | null;
}

export interface StandingsOptions {
  points?: { win?: number; draw?: number; loss?: number };
  /** Applied in order to teams level on points. Default ['HEAD_TO_HEAD','GOAL_DIFFERENCE','GOALS_FOR']. */
  tiebreak?: TiebreakCriterion[];
  /** Score credited for a forfeit. Default 3-0. */
  forfeitScore?: { winner: number; loser: number };
  /** 'POINTS_PER_GAME' ranks fairly when teams have played unequal games. */
  rankBy?: 'POINTS' | 'POINTS_PER_GAME';
  /** Penalty points per team (lower is better) for the FAIR_PLAY criterion. */
  fairPlay?: Record<string, number>;
  /** Seed for DRAW_LOT. */
  seed?: Seed;
}

export interface StandingsRow {
  rank: number;
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  pointsPerGame: number;
  fairPlay: number;
  /** True when the configured tiebreakers could not separate this team from a neighbour. */
  tied: boolean;
}

export const DEFAULT_OPTIONS: {
  points: { win: number; draw: number; loss: number };
  tiebreak: TiebreakCriterion[];
  forfeitScore: { winner: number; loser: number };
  rankBy: 'POINTS' | 'POINTS_PER_GAME';
  fairPlay: Record<string, number>;
  seed: Seed;
};

export function computeStandings(
  teamIds: readonly string[],
  matches: readonly StandingsMatch[],
  options?: StandingsOptions,
): StandingsRow[];
