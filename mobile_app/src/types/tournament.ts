/**
 * Tournaments types. Mirror of docs/plans/2026-10-tournaments-api-contract.md (server as implemented).
 * Fields the contract marks optional stay optional here; unknown extras are tolerated by consumers.
 */

export type TournamentSport = 'SOCCER' | 'BASKETBALL' | 'TENNIS';
export type TournamentFormat = 'LEAGUE' | 'KNOCKOUT' | 'GROUPS_KNOCKOUT' | 'CUSTOM';
export type TournamentStatus =
    | 'DRAFT'
    | 'REGISTRATION_OPEN'
    | 'REGISTRATION_CLOSED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED';
export type TournamentRole = 'ORGANIZER' | 'MANAGER' | 'SCOREKEEPER';
export type TournamentAssignableRole = 'MANAGER' | 'SCOREKEEPER';

export type TeamStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WAITLISTED' | 'WITHDRAWN';
export type TeamMemberRole = 'CAPTAIN' | 'PLAYER' | 'SUBSTITUTE';
export type TeamMemberStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'REMOVED' | string;
export type TeamDecision = 'APPROVE' | 'REJECT' | 'WAITLIST';

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'FORFEIT' | 'POSTPONED' | 'CANCELLED';
export type ResultStatus = 'FINISHED' | 'FORFEIT' | 'LIVE' | 'SCHEDULED';
export type StageType = 'LEAGUE' | 'GROUP' | 'KNOCKOUT' | string;

export interface TournamentRules {
    points?: { win: number; draw: number; loss: number };
    tiebreak?: string[];
    forfeitScore?: { winner: number; loser: number };
    legs?: 1 | 2;
    matchMinutes?: number;
    breakMinutes?: number;
    minRestMinutes?: number;
    thirdPlace?: boolean;
    seeding?: 'MANUAL' | 'RANDOM';
    groupCount?: number;
    advancePerGroup?: number;
    /** Tennis only. */
    bestOf?: 3 | 5;
}

/** List summary and base of the detail payload. `rules` is absent in list summaries. */
export interface Tournament {
    id: string;
    title: string;
    description?: string | null;
    sport: TournamentSport;
    format: TournamentFormat;
    status: TournamentStatus;
    startsAt: string;
    endsAt?: string | null;
    fieldId?: string | null;
    /** Catalog field, when the tournament is tied to one. */
    fieldName?: string | null;
    fieldLocation?: string | null;
    fieldLat?: number | null;
    fieldLng?: number | null;
    customLocation?: string | null;
    imageUrl?: string | null;
    isPublic?: boolean;
    openToMinors?: boolean;
    registrationOpensAt?: string | null;
    registrationClosesAt?: string | null;
    rosterLockAt?: string | null;
    minTeams?: number;
    maxTeams: number;
    startersPerTeam: number;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    requireApproval?: boolean;
    rules?: TournamentRules;
    /** Summaries only. */
    approvedTeams?: number;
    ownerId?: string;
    myRole?: TournamentRole | null;
    [extra: string]: unknown;
}

export interface TournamentMyTeam {
    id: string;
    name: string;
    status: TeamStatus;
    memberStatus: TeamMemberStatus;
    memberRole: TeamMemberRole;
    isCaptain: boolean;
}

export interface TournamentCapabilities {
    canManage: boolean;
    canScore: boolean;
    canManageRoles: boolean;
    canRegisterTeam: boolean;
}

export interface TournamentCounts {
    teamsApproved: number;
    teamsPending?: number;
    teamsWaitlisted?: number;
    matchesTotal: number;
    matchesFinished: number;
}

export interface TournamentDetail extends Tournament {
    myRole: TournamentRole | null;
    myTeam: TournamentMyTeam | null;
    counts: TournamentCounts;
    capabilities: TournamentCapabilities;
}

export interface TournamentFilters {
    /** One status or several (sent comma separated). */
    status?: TournamentStatus | TournamentStatus[];
    sport?: TournamentSport;
    city?: string;
    /** Only tournaments the viewer is part of (`mine=1`). */
    mine?: boolean;
    limit?: number;
    offset?: number;
}

export interface TournamentInput {
    title: string;
    description?: string;
    sport: TournamentSport;
    format: TournamentFormat;
    startsAt: string;
    endsAt?: string;
    fieldId?: string;
    customLocation?: string;
    imageUrl?: string;
    isPublic?: boolean;
    openToMinors?: boolean;
    registrationOpensAt?: string;
    registrationClosesAt?: string;
    rosterLockAt?: string;
    minTeams?: number;
    maxTeams: number;
    startersPerTeam: number;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    requireApproval?: boolean;
    rules?: TournamentRules;
}

export type TournamentPatch = Partial<TournamentInput> & { force?: boolean };

export interface TournamentRoleRow {
    userId: string;
    role: TournamentRole;
    name: string;
    imageUrl?: string | null;
}

// ---------------------------------------------------------------- teams

export interface TeamMember {
    userId: string;
    name: string;
    imageUrl?: string | null;
    role: TeamMemberRole;
    status: TeamMemberStatus;
    jerseyNumber?: number | null;
}

export interface TournamentTeam {
    id: string;
    tournamentId: string;
    name: string;
    color?: string | null;
    logoUrl?: string | null;
    captainId: string;
    status: TeamStatus;
    seed?: number | null;
    manualRank?: number | null;
    groupId?: string | null;
    memberCount: number;
    /** Captain / manager only. */
    joinCode?: string;
    members?: TeamMember[];
    /** Present on the list endpoint. */
    isMine?: boolean;
}

export interface TeamsResponse {
    tournamentId: string;
    teams: TournamentTeam[];
}

export interface CreateTeamInput {
    name: string;
    color?: string;
    logoUrl?: string;
}

export interface UpdateTeamInput {
    name?: string;
    color?: string;
    logoUrl?: string;
    /** Manager only. */
    seed?: number;
    /** Manager only. */
    manualRank?: number | null;
}

export interface MyInvite {
    tournamentId: string;
    tournamentTitle: string;
    sport: TournamentSport;
    startsAt: string;
    teamId: string;
    teamName: string;
    teamColor?: string | null;
    captainName: string;
    invitedAt: string;
}

// ---------------------------------------------------------------- matches

export type MatchSource =
    | { type: 'WINNER_OF' | 'LOSER_OF'; matchId: string }
    | { type: 'GROUP_RANK'; groupId: string; rank: number; pos?: number }
    | null;

export interface TeamRef {
    id: string;
    name: string;
    color?: string | null;
    logoUrl?: string | null;
}

export interface MatchSlot {
    teamId: string | null;
    team: TeamRef | null;
    source: MatchSource;
}

export interface MatchDetails {
    /** Tennis: one `[home, away]` pair per set. */
    sets?: [number, number][];
    bestOf?: number;
    [extra: string]: unknown;
}

export interface TournamentMatch {
    id: string;
    number: number;
    stageId: string | null;
    groupId: string | null;
    round: number | null;
    status: MatchStatus;
    home: MatchSlot;
    away: MatchSlot;
    scheduledAt: string | null;
    fieldId?: string | null;
    courtLabel?: string | null;
    homeScore: number | null;
    awayScore: number | null;
    homePenalties?: number | null;
    awayPenalties?: number | null;
    details?: MatchDetails | null;
    winnerTeamId?: string | null;
    /** Optimistic-lock token; send back as `expectedVersion` when saving a result. */
    version: number;
}

export interface ScheduleStage {
    id: string;
    order: number;
    type: StageType;
    name: string;
    config?: unknown;
    groups: { id: string; name: string }[];
}

export interface ScheduleFilters {
    teamId?: string;
    status?: MatchStatus | MatchStatus[];
    stageId?: string;
    /** ISO instants. */
    from?: string;
    to?: string;
}

export interface ScheduleResponse {
    tournamentId: string;
    stages: ScheduleStage[];
    matches: TournamentMatch[];
}

export type ConflictType =
    | 'NO_SLOT'
    | 'DEPENDENCY_UNSCHEDULED'
    | 'COURT_OVERLAP'
    | 'TEAM_OVERLAP'
    | 'TEAM_REST'
    | 'OUTSIDE_WINDOW';

/** Shape beyond `type` is server-defined (match numbers, team ids, court); consumers read what they need. */
export interface ScheduleConflict {
    type: ConflictType;
    [extra: string]: unknown;
}

export interface ScheduleGenerateInput {
    seed?: number | string;
    allowConflicts?: boolean;
    schedule?: {
        days?: { date: string; from: string; to: string }[];
        windows?: { start: string; end: string }[];
        courts?: number | string[];
        matchMinutes?: number;
        breakMinutes?: number;
        minRestMinutes?: number;
        stepMinutes?: number;
    };
}

export interface SchedulePreviewMatch {
    key: string;
    number: number;
    stageKey: string;
    groupKey?: string | null;
    round: number | null;
    home: { teamId: string | null; source: MatchSource };
    away: { teamId: string | null; source: MatchSource };
    scheduledAt: string | null;
    courtLabel?: string | null;
}

export interface SchedulePreviewResponse {
    preview: true;
    stages: unknown[];
    matches: SchedulePreviewMatch[];
    conflicts: ScheduleConflict[];
    teamCount: number;
}

export interface ScheduleCommitResponse {
    preview: false;
    matchCount: number;
    scheduledCount: number;
    conflicts: ScheduleConflict[];
}

export interface CreateMatchInput {
    stageId?: string;
    groupId?: string;
    round?: number;
    homeTeamId?: string;
    awayTeamId?: string;
    scheduledAt?: string;
    courtLabel?: string;
    fieldId?: string;
    force?: boolean;
}

export interface UpdateMatchInput {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    scheduledAt?: string | null;
    courtLabel?: string | null;
    fieldId?: string | null;
    round?: number;
    status?: 'SCHEDULED' | 'LIVE' | 'POSTPONED' | 'CANCELLED';
    force?: boolean;
}

export interface MatchMutationResponse {
    match: TournamentMatch;
    conflicts: ScheduleConflict[];
}

// ---------------------------------------------------------------- results

export interface SaveMatchResultInput {
    /** Required: `TournamentMatch.version` the editor started from. */
    expectedVersion: number;
    status: ResultStatus;
    homeScore: number;
    awayScore: number;
    /** Knockout draws. */
    penalties?: { home: number; away: number };
    /** Tennis. */
    details?: { sets: [number, number][] };
    forfeitBy?: string;
    /** `{ [userId]: { goals: 2 } }` */
    stats?: Record<string, Record<string, number>>;
    /** Organizer only. */
    force?: boolean;
}

export interface ResultWarning {
    code: 'PLAYER_SUM_EXCEEDS_SCORE' | string;
    key?: string;
    sum?: number;
    teamScore?: number;
    teamId?: string;
}

export interface SaveMatchResultResponse {
    match: TournamentMatch;
    changedMatchIds: string[];
    warnings: ResultWarning[];
}

/** Result save state exposed by `useSaveMatchResult` instead of throwing for these two. */
export interface VersionConflictState {
    currentVersion: number;
}
export interface DownstreamFinishedState {
    /** Id of the already-finished downstream match; map to `number` through the schedule. */
    matchId: string;
    /** True when the viewer is an organizer and may retry with `force: true`. */
    canForce: boolean;
}

// ---------------------------------------------------------------- computed views

export interface StandingsRow {
    rank: number;
    team: TeamRef;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
    tied: boolean;
    manualRank: number | null;
}

export interface StandingsTable {
    stageId: string;
    stageName: string;
    stageType: StageType;
    groupId: string | null;
    groupName: string | null;
    /** All matches of the table are finished. */
    complete: boolean;
    needsManualRank: boolean;
    rows: StandingsRow[];
}

export interface StandingsResponse {
    tournamentId: string;
    tables: StandingsTable[];
}

export type BracketMatch = TournamentMatch & { isThirdPlace?: boolean };

export interface BracketRound {
    round: number;
    name: string;
    matches: BracketMatch[];
}

export interface BracketStage {
    stageId: string;
    name: string;
    rounds: BracketRound[];
}

export interface BracketResponse {
    tournamentId: string;
    stages: BracketStage[];
}

export interface LeaderRow {
    rank: number;
    userId: string;
    name: string;
    imageUrl?: string | null;
    teamId: string;
    teamName: string;
    value: number;
    matches: number;
}

export interface LeadersResponse {
    tournamentId: string;
    key: string;
    label: { he: string; en: string };
    /** Selectable stat keys for this tournament's sport. */
    keys: string[];
    leaders: LeaderRow[];
}

// ---------------------------------------------------------------- realtime

export type TournamentUpdateType = 'teams' | 'schedule' | 'result' | 'status';

export interface TournamentUpdateEvent {
    tournamentId: string;
    type: TournamentUpdateType;
    matchId?: string;
    changedMatchIds?: string[];
    at: string | number;
}

// ---------------------------------------------------------------- errors

/** `err.code` values the tournament endpoints can return (apiClient errors carry `err.code`, `err.status`, `err.body`). */
export type TournamentErrorCode =
    | 'PLAYER_IN_OTHER_TEAM'
    | 'TOO_MANY_PLAYERS'
    | 'MINORS_NOT_ALLOWED'
    | 'ROSTER_LOCKED'
    | 'REGISTRATION_CLOSED'
    | 'NAME_TAKEN'
    | 'INVALID_CODE'
    | 'CAPTAIN_CANNOT_LEAVE'
    | 'ROSTER_INVALID'
    | 'TOURNAMENT_FULL'
    | 'CANNOT_START'
    | 'SCHEDULE_HAS_RESULTS'
    | 'SCHEDULE_CONFLICTS'
    | 'SCHEDULE_CONFLICT'
    | 'MATCH_REFERENCED'
    | 'MATCH_FINISHED'
    | 'VERSION_CONFLICT'
    | 'DOWNSTREAM_FINISHED'
    | 'NEEDS_PENALTIES'
    | 'INVALID_RESULT'
    | 'INVALID_SCORES'
    | 'INVALID_STATS'
    | 'NOT_IN_PROGRESS'
    | 'TEAMS_UNKNOWN'
    | 'WRONG_STATUS';
