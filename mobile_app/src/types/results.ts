import type { ResultOutcome, StatSport } from '@joinup/shared/matchStats';

export type { ResultOutcome, StatSport };

/** Server-validated value sets. Mirror server/routes/userReports.js and routes/admin.js. */
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
export const USER_REPORT_RESOLUTION_MAX = 500;

export type UserReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

/** Tennis sets, always from side 0's perspective: [[a, b], ...]. */
export type TennisSets = Array<[number, number]>;

export interface GameResultSide {
    id: string;
    order: 0 | 1;
    teamId: string | null;
    label: string;
    score: number;
    sets: TennisSets | null;
    outcome: ResultOutcome;
}

export interface GameResultPlayerStats {
    userId: string;
    sideId: string | null;
    values: Record<string, number>;
}

export interface GameResultRecordedBy {
    id: string;
    name: string;
}

export interface GameResultRecord {
    id: string;
    status: 'FINAL';
    sport: StatSport;
    sides: GameResultSide[];
    /** Already privacy-filtered for the viewer (empty when only a link-holder). */
    stats: GameResultPlayerStats[];
    notes: string | null;
    recordedBy: GameResultRecordedBy | null;
    recordedAt: string;
    editedAt: string | null;
    lockedAt: string | null;
}

export interface GameResultRosterEntry {
    userId: string;
    name: string;
    imageUrl: string | null;
    sideId: string | null;
}

/** GET /api/games/:id/result */
export interface GameResultView {
    /** The game has finished, so a result may be recorded. */
    eligible: boolean;
    /** Viewer may save/delete now (manager/admin, eligible, not locked). */
    canEdit: boolean;
    /** The 7-day edit window has passed (admins can still edit). */
    locked: boolean;
    sport: StatSport;
    result: GameResultRecord | null;
    roster: GameResultRosterEntry[];
}

export interface GameResultWarning {
    code: 'PLAYER_SUM_EXCEEDS_SCORE';
    key: 'goals' | 'points';
    sum: number;
    teamScore: number;
    sideOrder: 0 | 1;
}

/** PUT /api/games/:id/result response. */
export interface SaveGameResultResponse extends GameResultView {
    warnings: GameResultWarning[];
    savedAt: string;
}

/** Write model for one side. Team sports send `score`; tennis sends `sets` on side 0 only (side 1 is derived). */
export interface GameResultSideInput {
    label: string;
    teamId?: string | null;
    score?: number;
    sets?: TennisSets;
}

export interface GameResultPlayerInput {
    userId: string;
    /** Which side the player was on; omit/null if unknown. */
    sideOrder?: 0 | 1 | null;
    values?: Record<string, number>;
}

export interface SaveGameResultInput {
    /** Exactly two sides, in order [home, away]. */
    sides: [GameResultSideInput, GameResultSideInput];
    stats?: GameResultPlayerInput[];
    notes?: string | null;
    /** Tennis only. */
    bestOf?: 3 | 5;
}

/** Error `code` values the result endpoints can return (apiClient errors carry `err.code` and `err.status`). */
export type GameResultErrorCode =
    | 'GAME_FRIENDS_ONLY'
    | 'NOT_MANAGER'
    | 'RESULT_LOCKED'
    | 'GAME_CANCELLED'
    | 'GAME_NOT_FINISHED'
    | 'NOT_CONFIRMED_PARTICIPANT'
    | 'NO_RESULT'
    | 'NOT_PARTICIPANT'
    | 'OWN_RESULT'
    | 'UNSUPPORTED_SPORT'
    | 'INVALID_SIDES'
    | 'INVALID_RESULT'
    | 'INVALID_STATS'
    | 'DUPLICATE_PLAYER';

export interface UserSportStats {
    sport: StatSport;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    /** stat key -> total (see getStatDefs(sport) for keys/labels). */
    totals: Record<string, number>;
    perGame: Record<string, number>;
}

/** GET /api/users/:id/stats */
export interface UserStatsResponse {
    visible: boolean;
    /** Present only when `visible` is false. */
    hiddenReason?: 'USER_HIDDEN' | 'PRIVATE';
    /** Present (true) only for the owner while their stats are hidden from everyone else. */
    ownerHidden?: boolean;
    sports: UserSportStats[];
}

export interface UserReportParty {
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
    reporter: UserReportParty;
    target: UserReportParty;
    game: { id: string; title: string | null; start: string | null; field: { name: string } | null } | null;
    tournamentId: string | null;
    tournament: { id: string; title: string | null } | null;
    /** OPEN reports against the same player (this one included while it is open). */
    openReportsOnTarget: number;
}

export interface SubmitUserReportInput {
    targetId: string;
    reason: UserReportReason;
    details?: string;
    gameId?: string;
}
