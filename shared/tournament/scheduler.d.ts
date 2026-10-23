export interface TimeWindow {
  /** ISO instants, e.g. '2026-11-07T07:00:00Z'. Convert local day windows to instants before calling. */
  start: string;
  end: string;
}

export interface ScheduleConfig {
  windows: TimeWindow[];
  /** A count (courts are numbered 1..n) or explicit court labels. Default 1. */
  courts?: number | string[];
  matchMinutes: number;
  /** Minimum gap between two matches on the same court. Default 0. */
  breakMinutes?: number;
  /** Minimum gap between two matches of the same team (and after a match's dependencies). Default 0. */
  minRestMinutes?: number;
  /** Granularity of candidate start times. Default 5. */
  stepMinutes?: number;
  /** Fixed matches already on the calendar that new ones must avoid. */
  existing?: ScheduledEntry[];
}

export interface ScheduleMatchInput {
  id: string;
  /** Omit (null) for TBD slots; team checks are then skipped for that side. */
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  durationMinutes?: number;
  notBefore?: string;
  /** Match ids that must end (plus rest) before this one starts, e.g. bracket feeders. */
  dependsOn?: string[];
}

export interface ScheduledEntry {
  id: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  scheduledAt: string;
  court: string | number;
  durationMinutes?: number;
}

export interface ScheduledMatch {
  matchId: string;
  scheduledAt: string;
  endsAt: string;
  court: string | number;
}

export type ConflictType =
  | 'NO_SLOT'
  | 'DEPENDENCY_UNSCHEDULED'
  | 'COURT_OVERLAP'
  | 'TEAM_OVERLAP'
  | 'TEAM_REST'
  | 'OUTSIDE_WINDOW';

export interface ScheduleConflict {
  type: ConflictType;
  matchIds: string[];
  teamId?: string;
  court?: string | number;
  message: string;
}

export interface ScheduleResult {
  scheduled: ScheduledMatch[];
  conflicts: ScheduleConflict[];
}

/** Greedy, deterministic; matches are placed in input order. Unplaceable matches come back as conflicts. */
export function scheduleMatches(matches: readonly ScheduleMatchInput[], config: ScheduleConfig): ScheduleResult;

/** Validate a hand-edited schedule; `windows` may be empty to skip the window check. */
export function findConflicts(
  entries: readonly ScheduledEntry[],
  config: Omit<ScheduleConfig, 'windows' | 'existing'> & { windows?: TimeWindow[] },
): ScheduleConflict[];

/** Canonical court identity: "1" and "מגרש 1" are the same court; other names compare trimmed, case-insensitive. */
export function courtKey(court: unknown): string;
