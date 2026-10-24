import type { Seed } from './rng';

export interface RoundRobinOptions {
  /** 1 (default) or 2; leg 2 mirrors home/away of leg 1. */
  legs?: 1 | 2;
  /** Randomise the team order (deterministically from `seed`) before generating. */
  shuffle?: boolean;
  seed?: Seed;
}

export interface RoundRobinMatch {
  /** 1-based, continues across legs (leg 2 starts after the last leg-1 round). */
  round: number;
  leg: 1 | 2;
  home: string;
  away: string;
}

export interface RoundRobinRound {
  round: number;
  matches: RoundRobinMatch[];
  /** Team sitting out this round when the team count is odd. */
  bye: string | null;
}

export interface RoundRobinResult {
  rounds: RoundRobinRound[];
  byes: { round: number; team: string }[];
}

export function generateRoundRobin(teamIds: readonly string[], options?: RoundRobinOptions): RoundRobinResult;
export function flattenRounds(rr: RoundRobinResult): RoundRobinMatch[];

export interface GroupSplitOptions {
  shuffle?: boolean;
  seed?: Seed;
}

/** Snake-seeded split; `teamIds` is in seed order (best first). */
export function splitIntoGroups(teamIds: readonly string[], groupCount: number, options?: GroupSplitOptions): string[][];

export interface GroupStageEntry extends RoundRobinResult {
  index: number;
  teams: string[];
}

export function generateGroupStage(
  teamIds: readonly string[],
  groupCount: number,
  options?: GroupSplitOptions & { legs?: 1 | 2 },
): GroupStageEntry[];
