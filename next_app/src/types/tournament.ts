// Tournament API types (contract: docs/plans/2026-10-tournaments-api-contract.md).
// Shared by services/api/tournaments.ts, hooks/tournaments and components/tournaments.

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
export type TeamStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WAITLISTED' | 'WITHDRAWN';
export type TeamMemberRole = 'CAPTAIN' | 'PLAYER' | 'SUBSTITUTE';
export type TeamMemberStatus = 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'REMOVED' | (string & {});
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'FORFEIT' | 'POSTPONED' | 'CANCELLED';
export type TeamDecision = 'APPROVE' | 'REJECT' | 'WAITLIST';
export type TournamentUpdateType = 'teams' | 'schedule' | 'result' | 'status';

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
    bestOf?: 3 | 5;
}

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
    isPublic: boolean;
    openToMinors: boolean;
    registrationOpensAt?: string | null;
    registrationClosesAt?: string | null;
    rosterLockAt?: string | null;
    minTeams: number;
    maxTeams: number;
    startersPerTeam: number;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    requireApproval: boolean;
    /** Absent on list summaries. */
    rules?: TournamentRules;
    /** List summaries only. */
    approvedTeams?: number;
    ownerId?: string;
    myRole?: TournamentRole | null;
}

export interface MyTeamSummary {
    id: string;
    name: string;
    status: TeamStatus;
    memberStatus: TeamMemberStatus;
    memberRole: TeamMemberRole;
    isCaptain: boolean;
}

export interface TournamentCapabilitiesOnDetail {
    canManage: boolean;
    canScore: boolean;
    canManageRoles: boolean;
    canRegisterTeam: boolean;
}

export interface TournamentDetail extends Tournament {
    myRole: TournamentRole | null;
    myTeam: MyTeamSummary | null;
    counts: {
        teamsApproved: number;
        teamsPending?: number;
        teamsWaitlisted?: number;
        matchesTotal: number;
        matchesFinished: number;
    };
    capabilities: TournamentCapabilitiesOnDetail;
}

export interface TournamentFilters {
    /** One status or several (sent comma separated). */
    status?: TournamentStatus | TournamentStatus[];
    sport?: TournamentSport;
    city?: string;
    mine?: boolean;
    limit?: number;
    offset?: number;
}

export interface CreateTournamentInput {
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
export type PatchTournamentInput = Partial<CreateTournamentInput> & { force?: boolean };

export interface TournamentRoleRow {
    userId: string;
    role: TournamentRole;
    name: string;
    imageUrl?: string | null;
}

export interface TeamMember {
    userId: string;
    name: string;
    imageUrl?: string | null;
    role: TeamMemberRole;
    status: TeamMemberStatus;
    jerseyNumber?: number | null;
}

export interface TeamLite {
    id: string;
    name: string;
    color?: string | null;
    logoUrl?: string | null;
}

export interface TournamentTeam extends TeamLite {
    tournamentId: string;
    captainId: string;
    status: TeamStatus;
    seed?: number | null;
    manualRank?: number | null;
    groupId?: string | null;
    memberCount: number;
    /** Captain / manager only. */
    joinCode?: string;
    members: TeamMember[];
    isMine?: boolean;
}

export interface CreateTeamInput {
    name: string;
    color?: string;
    logoUrl?: string;
}
export interface PatchTeamInput {
    name?: string;
    color?: string;
    logoUrl?: string;
    /** Manager only. */
    seed?: number | null;
    /** Manager only. */
    manualRank?: number | null;
}
export interface PatchMemberInput {
    jerseyNumber?: number | null;
    role?: 'PLAYER' | 'SUBSTITUTE';
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

export type MatchSource =
    | { type: 'WINNER_OF' | 'LOSER_OF'; matchId: string }
    | { type: 'GROUP_RANK'; groupId: string; rank: number; pos?: number }
    | null;

export interface MatchSlot {
    teamId: string | null;
    team: TeamLite | null;
    source: MatchSource;
}

export interface MatchDetails {
    sets?: Array<[number, number]>;
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
    fieldId: string | null;
    courtLabel: string | null;
    homeScore: number | null;
    awayScore: number | null;
    homePenalties: number | null;
    awayPenalties: number | null;
    details: MatchDetails | null;
    winnerTeamId: string | null;
    /** Optimistic-lock version; send it back as `expectedVersion`. */
    version: number;
    isThirdPlace?: boolean;
}

export type ScheduleConflictType =
    | 'NO_SLOT'
    | 'DEPENDENCY_UNSCHEDULED'
    | 'COURT_OVERLAP'
    | 'TEAM_OVERLAP'
    | 'TEAM_REST'
    | 'OUTSIDE_WINDOW';
export interface ScheduleConflict {
    type: ScheduleConflictType;
    [extra: string]: unknown;
}

export interface TournamentStage {
    id: string;
    order: number;
    type: string;
    name: string;
    config?: unknown;
    groups: Array<{ id: string; name: string }>;
}
export interface TournamentSchedule {
    tournamentId: string;
    stages: TournamentStage[];
    matches: TournamentMatch[];
}
export interface ScheduleFilters {
    teamId?: string;
    status?: MatchStatus | MatchStatus[];
    stageId?: string;
    from?: string;
    to?: string;
}

export interface ScheduleGenerateInput {
    seed?: number | string;
    allowConflicts?: boolean;
    schedule?: {
        days?: Array<{ date: string; from: string; to: string }>;
        windows?: Array<{ start: string; end: string }>;
        courts?: number | string[];
        matchMinutes?: number;
        breakMinutes?: number;
        minRestMinutes?: number;
        stepMinutes?: number;
    };
}
export interface SchedulePreviewSlot {
    teamId: string | null;
    source: { type: string; [k: string]: unknown } | null;
}
export interface SchedulePreviewMatch {
    key: string;
    number: number;
    stageKey: string;
    groupKey: string | null;
    round: number | null;
    home: SchedulePreviewSlot;
    away: SchedulePreviewSlot;
    scheduledAt: string | null;
    courtLabel: string | null;
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
export interface PatchMatchInput {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    scheduledAt?: string | null;
    courtLabel?: string | null;
    fieldId?: string | null;
    round?: number;
    status?: 'SCHEDULED' | 'LIVE' | 'POSTPONED' | 'CANCELLED';
    force?: boolean;
}
export interface MatchWithConflicts {
    match: TournamentMatch;
    conflicts: ScheduleConflict[];
}

export type SaveMatchResultStatus = 'FINISHED' | 'FORFEIT' | 'LIVE' | 'SCHEDULED';
export interface SaveMatchResultInput {
    expectedVersion: number;
    status: SaveMatchResultStatus;
    homeScore?: number;
    awayScore?: number;
    penalties?: { home: number; away: number };
    details?: { sets: Array<[number, number]> };
    forfeitBy?: string;
    stats?: Record<string, Record<string, number>>;
    /** Organizer only. */
    force?: boolean;
}
export interface ResultWarning {
    code: 'PLAYER_SUM_EXCEEDS_SCORE' | (string & {});
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

export interface StandingsRow {
    rank: number;
    team: TeamLite;
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
    /** Team withdrew after playing: results stay in the table but the row is marked. */
    withdrawn?: boolean;
}
export interface StandingsTableData {
    stageId: string;
    stageName: string;
    stageType: string;
    groupId: string | null;
    groupName: string | null;
    complete: boolean;
    needsManualRank: boolean;
    rows: StandingsRow[];
}
export interface StandingsResponse {
    tournamentId: string;
    tables: StandingsTableData[];
}

export interface BracketRound {
    round: number;
    name: string;
    matches: TournamentMatch[];
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
    keys: string[];
    leaders: LeaderRow[];
}

/** Payload of the `tournament:update` socket event. */
export interface TournamentUpdateEvent {
    tournamentId: string;
    type: TournamentUpdateType;
    matchId?: string;
    changedMatchIds?: string[];
    at: string;
}
