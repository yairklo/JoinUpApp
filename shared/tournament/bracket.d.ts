import type { Seed } from './rng';

export type SlotSource =
  | { type: 'BYE' }
  | { type: 'WINNER_OF'; matchId: string }
  | { type: 'LOSER_OF'; matchId: string }
  | { type: 'GROUP_RANK'; groupId: string; rank: number };

export interface BracketSlot {
  /** Resolved team, or null while the source is still undecided (or for a bye). */
  teamId: string | null;
  /** Where the team comes from; null when the team was placed directly. */
  source: SlotSource | null;
}

export type BracketMatchStatus = 'SCHEDULED' | 'FINISHED' | 'BYE';

export interface BracketMatch {
  /** 'R<round>M<position>' (e.g. 'R1M3'), or 'TP' for the third-place match. */
  id: string;
  round: number;
  position: number;
  isThirdPlace: boolean;
  home: BracketSlot;
  away: BracketSlot;
  status: BracketMatchStatus;
  winnerId: string | null;
  loserId: string | null;
}

export interface GroupRankEntry {
  groupId: string;
  rank: number;
}

/** A seed entry: a team id, or a group-rank placeholder resolved later with resolveGroupRanks. */
export type BracketEntry = string | GroupRankEntry;

export interface BracketOptions {
  /** 'MANUAL' (default): entries are already in seed order. 'RANDOM': shuffled deterministically by `seed`. */
  seeding?: 'MANUAL' | 'RANDOM';
  seed?: Seed;
  /** Add a third-place match (only when both semifinals are real matches, i.e. N >= 4 with no bye in them). */
  thirdPlace?: boolean;
}

export interface Bracket {
  /** Next power of two >= number of entries. */
  size: number;
  roundCount: number;
  /** Entries in final seed order. */
  seeds: BracketEntry[];
  matches: BracketMatch[];
}

export interface BracketRound {
  round: number;
  name: string;
  matches: BracketMatch[];
}

export function nextPowerOfTwo(n: number): number;
export function seedOrder(size: number): number[];
export function roundName(round: number, totalRounds: number): string;
export function groupRankSeeds(groupIds: readonly string[], advancePerGroup: number): GroupRankEntry[];
export function generateBracket(entries: readonly BracketEntry[], options?: BracketOptions): Bracket;

/**
 * Record a result (winnerId) and resolve downstream WINNER_OF / LOSER_OF slots. Pure.
 * winnerId = null undoes the result. Throws if the winner is not in the match, the teams are not
 * known yet, or a downstream match was already played.
 */
export function advance(
  matches: readonly BracketMatch[],
  matchId: string,
  winnerId: string | null,
): { matches: BracketMatch[]; changed: string[] };

export function resolveGroupRanks(
  matches: readonly BracketMatch[],
  rankings: Record<string, readonly string[]>,
): BracketMatch[];

export function getRounds(bracket: Pick<Bracket, 'roundCount' | 'matches'>): BracketRound[];
