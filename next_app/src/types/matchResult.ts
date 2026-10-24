// Wire types for Feature 1 (match results, player stats, player reports).
// Mirrors server/services/gameResultService.js, userStatsService.js, routes/userReports.js and the
// user-reports handlers in routes/admin.js. Stat keys/labels live in @joinup/shared/matchStats.
import type { ResultOutcome, StatSport, TennisSets } from '@joinup/shared/matchStats';
import type { EveningSummary, ResultLineupMode } from '@joinup/shared/eveningSummary';

export type { ResultOutcome, StatSport, TennisSets };

/** A player's stat values keyed by stat key (see getStatDefs(sport)). */
export type StatValues = Record<string, number>;

export type GameResultStatus = 'FINAL';

export interface GameResultSide {
    id: string;
    /** 0 or 1 (home/away, or player A/B in tennis). */
    order: number;
    teamId: string | null;
    label: string;
    /** Goals/points; tennis: sets won. */
    score: number;
    /** Tennis only: this side's games per set, e.g. [[6,4],[3,6]]. Null for team sports. */
    sets: TennisSets | null;
    outcome: ResultOutcome;
    /** Who played this side in this round, when the side is nested under a round. */
    players?: Array<{ userId: string; goals: number }>;
}

export interface GameResultRound {
    id: string | null;
    /** 1-based. */
    order: number;
    sides: GameResultSide[];
}

export interface GameResultPlayerStats {
    userId: string;
    sideId: string | null;
    values: StatValues;
}

export interface GameResultRecorder {
    id: string;
    name: string;
}

export interface GameResultData {
    id: string;
    status: GameResultStatus;
    sport: string;
    /** Null for a single score. */
    lineupMode?: ResultLineupMode | null;
    /** Round 1, so a one-score result keeps the same shape. */
    sides: GameResultSide[];
    /** Present once a result exists. Length 1 for a single score. */
    rounds?: GameResultRound[];
    summary?: EveningSummary | null;
    /** Already privacy-filtered for the viewer (managers who can edit see all rows). */
    stats: GameResultPlayerStats[];
    notes: string | null;
    recordedBy: GameResultRecorder | null;
    recordedAt: string;
    editedAt: string | null;
    lockedAt: string | null;
}

export interface GameResultRosterPlayer {
    userId: string;
    name: string;
    imageUrl: string | null;
    teamId?: string | null;
    /** Side the player is on (from saved stats, else from their team); null if unknown. */
    sideId: string | null;
}

/** GET /api/games/:id/result. */
export interface GameResultView {
    /** The game has finished and can take a result. */
    eligible: boolean;
    /** Viewer is a manager/admin, the game is eligible and (unless admin) not locked. */
    canEdit: boolean;
    locked: boolean;
    sport: string;
    /** Null when nothing is recorded yet. */
    result: GameResultData | null;
    /** Confirmed participants; empty for friends-only link outsiders. */
    roster: GameResultRosterPlayer[];
}

export interface PlayerTotalsWarning {
    code: 'PLAYER_SUM_EXCEEDS_SCORE';
    key: 'goals' | 'points';
    sum: number;
    teamScore: number;
    sideOrder: number;
}

/** PUT /api/games/:id/result response: the fresh view plus soft warnings. */
export interface SaveGameResultResponse extends GameResultView {
    warnings: PlayerTotalsWarning[];
    savedAt: string;
}

export interface GameResultSideInput {
    label: string;
    teamId?: string | null;
    /** Team sports. */
    score?: number;
    /** Tennis: only side 0's sets are read, from side 0's perspective. */
    sets?: TennisSets;
}

export interface GameResultPlayerInput {
    userId: string;
    /** 0 or 1; null/omitted when the player's side is unknown. */
    sideOrder?: 0 | 1 | null;
    values?: StatValues;
}

/** PUT /api/games/:id/result body for one score. Exactly two sides. */
export interface SaveSingleGameResultInput {
    sides: [GameResultSideInput, GameResultSideInput];
    stats?: GameResultPlayerInput[];
    notes?: string | null;
    /** Tennis only. */
    bestOf?: 3 | 5;
}

export interface SaveEveningSideInput {
    label: string;
    teamId?: string | null;
    score?: number;
    sets?: TennisSets;
    players?: Array<{ userId: string; goals?: number }>;
}

/** PUT body for one or more rounds of the same game. */
export interface SaveEveningResultInput {
    lineupMode: ResultLineupMode;
    rounds: Array<{ sides: [SaveEveningSideInput, SaveEveningSideInput] | SaveEveningSideInput[] }>;
    notes?: string | null;
    bestOf?: 3 | 5;
}

export type SaveGameResultInput = SaveSingleGameResultInput | SaveEveningResultInput;

/** Server error `code`s a result call can return (see apiClient error.code). */
export type GameResultErrorCode =
    | 'GAME_FRIENDS_ONLY'
    | 'NOT_MANAGER'
    | 'RESULT_LOCKED'
    | 'GAME_CANCELLED'
    | 'GAME_NOT_FINISHED'
    | 'NOT_CONFIRMED_PARTICIPANT'
    | 'UNSUPPORTED_SPORT'
    | 'INVALID_SIDES'
    | 'INVALID_RESULT'
    | 'INVALID_STATS'
    | 'DUPLICATE_PLAYER'
    | 'INVALID_ROUNDS'
    | 'LINEUP_MODE_REQUIRED'
    | 'MULTI_ROUND_RESULT'
    | 'NO_RESULT'
    | 'NOT_PARTICIPANT'
    | 'OWN_RESULT';

// ── User stats ──────────────────────────────────────────────────────────────

export interface SportStatsAggregate {
    sport: string;
    /** Games with recorded stats (denominator of perGame). */
    games: number;
    /** Past games played, same set as the match-history list. */
    gamesPlayed?: number;
    wins: number;
    draws: number;
    losses: number;
    /** Per-round W/D/L. Separate from match wins: an evening counts as one game. */
    roundWins?: number;
    roundDraws?: number;
    roundLosses?: number;
    totals: StatValues;
    perGame: StatValues;
}

export type StatsHiddenReason = 'USER_HIDDEN' | 'PRIVATE';

/** GET /api/users/:id/stats[?sport=]. A hidden profile returns visible:false (200), not 403. */
export interface UserStatsResponse {
    visible: boolean;
    hiddenReason?: StatsHiddenReason;
    /** Owner-only: their stats are hidden from everyone else. */
    ownerHidden?: boolean;
    sports: SportStatsAggregate[];
}

/** Badge on a match-history item (profile `matchHistory[].result`). */
export interface MatchHistoryResult {
    outcome: ResultOutcome | null;
    /** "mine-theirs". Null when the evening has several rounds. */
    score: string | null;
    myStats: StatValues;
    /** Set only for a multi-round evening. */
    rounds?: { wins: number; draws: number; losses: number };
}

export interface StatsSummary {
    sport: string;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    headline: Array<{ key: string; total: number; perGame: number }>;
}

// ── Reports ─────────────────────────────────────────────────────────────────

export const USER_REPORT_REASONS = [
    'HARASSMENT',
    'VIOLENCE',
    'CHEATING',
    'NO_SHOW',
    'FAKE_PROFILE',
    'INAPPROPRIATE_CONTENT',
    'RESULT_DISPUTE',
    'OTHER',
] as const;
export type UserReportReason = (typeof USER_REPORT_REASONS)[number];

export const USER_REPORT_DETAILS_MAX = 1000;
export const RESULT_DISPUTE_DETAILS_MAX = 1000;
export const RESOLUTION_MAX = 500;

export interface SubmitUserReportInput {
    targetId: string;
    reason: UserReportReason;
    gameId?: string | null;
    /** Up to USER_REPORT_DETAILS_MAX chars. */
    details?: string;
}

export type UserReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface AdminUserReportPerson {
    id: string;
    name: string | null;
    imageUrl: string | null;
}

export interface AdminUserReport {
    id: string;
    reason: UserReportReason;
    details: string | null;
    status: UserReportStatus;
    resolution: string | null;
    resolvedById: string | null;
    resolvedAt: string | null;
    createdAt: string;
    reporter: AdminUserReportPerson;
    target: AdminUserReportPerson;
    /** start/field are null when the game no longer exists. */
    game: { id: string; title: string | null; start: string | null; field: { name: string } | null } | null;
    tournamentId: string | null;
    tournament: { id: string; title: string | null } | null;
    /** OPEN reports against the same player (this one included while open). */
    openReportsOnTarget: number;
}

export type UserReportResolveAction = 'NONE' | 'BAN';
