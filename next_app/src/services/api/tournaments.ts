import { apiClient } from './client';
import { toTournamentError } from './tournaments.errors';
import type {
    CreateMatchInput,
    CreateTeamInput,
    CreateTournamentInput,
    LeadersResponse,
    BracketResponse,
    MatchWithConflicts,
    MyInvite,
    PatchMatchInput,
    PatchMemberInput,
    PatchTeamInput,
    PatchTournamentInput,
    SaveMatchResultInput,
    SaveMatchResultResponse,
    ScheduleCommitResponse,
    ScheduleFilters,
    ScheduleGenerateInput,
    SchedulePreviewResponse,
    StandingsOverrideInput,
    StandingsOverrideResult,
    StandingsResponse,
    TeamDecision,
    TeamMember,
    Tournament,
    TournamentDetail,
    TournamentFilters,
    TournamentRole,
    TournamentRoleRow,
    TournamentSchedule,
    TournamentStatus,
    TournamentTeam,
    TeamStatus,
} from '@/types/tournament';

export * from './tournaments.errors';

const BASE = '/api/tournaments';

type Query = Record<string, string | number | boolean | undefined | null | Array<string | number>>;

/** Build `?a=1&b=x,y`; skips empty values, joins arrays with commas, booleans become `1`. */
export function buildQuery(params: Query = {}): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '' || v === false) continue;
        if (Array.isArray(v)) {
            if (v.length === 0) continue;
            parts.push(`${k}=${encodeURIComponent(v.join(','))}`);
        } else {
            parts.push(`${k}=${encodeURIComponent(v === true ? '1' : String(v))}`);
        }
    }
    return parts.length ? `?${parts.join('&')}` : '';
}

interface CallOpts {
    token?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    data?: unknown;
}

/** apiClient wrapper: every failure is rethrown as a typed TournamentApiError (see tournaments.errors.ts). */
async function call<T>(path: string, { token, method = 'GET', data }: CallOpts = {}): Promise<T> {
    try {
        return await apiClient<T>(`${BASE}${path}`, {
            token,
            method,
            data,
            cache: 'no-store',
        });
    } catch (e) {
        throw toTournamentError(e);
    }
}

const t = (id: string) => `/${encodeURIComponent(id)}`;
const tm = (id: string, teamId: string) => `${t(id)}/teams/${encodeURIComponent(teamId)}`;

/**
 * Tournaments API (contract: docs/plans/2026-10-tournaments-api-contract.md).
 * `token` is required where the contract says auth, optional ("opt") for public reads; never throw
 * anything but a TournamentApiError subclass.
 */
export const tournamentsApi = {
    // ---- capabilities / list / create ----
    /** Works for guests too: `canView` is the feature gate, `canCreate` the create entry point. */
    capabilities: (token?: string) =>
        call<{ public: boolean; canView: boolean; canCreate: boolean; canCreateTournaments?: boolean }>('/capabilities', { token }),
    list: (filters: TournamentFilters = {}, token?: string) =>
        call<Tournament[]>(
            `/${buildQuery({
                status: filters.status,
                sport: filters.sport,
                city: filters.city,
                mine: filters.mine,
                limit: filters.limit,
                offset: filters.offset,
            })}`,
            { token }
        ),
    create: (data: CreateTournamentInput, token: string) =>
        call<Tournament>('/', { method: 'POST', data, token }),
    get: (id: string, token?: string) => call<TournamentDetail>(t(id), { token }),
    patch: (id: string, data: PatchTournamentInput, token: string) =>
        call<Tournament>(t(id), { method: 'PATCH', data, token }),
    setStatus: (id: string, status: TournamentStatus, token: string, force?: boolean) =>
        call<Tournament & { previousStatus: TournamentStatus }>(`${t(id)}/status`, {
            method: 'POST',
            data: force ? { status, force } : { status },
            token,
        }),

    // ---- roles ----
    listRoles: (id: string, token: string) => call<TournamentRoleRow[]>(`${t(id)}/roles`, { token }),
    addRole: (id: string, userId: string, role: Exclude<TournamentRole, 'ORGANIZER'>, token: string) =>
        call<{ userId: string; role: TournamentRole }>(`${t(id)}/roles`, { method: 'POST', data: { userId, role }, token }),
    removeRole: (id: string, userId: string, token: string) =>
        call<{ ok: true }>(`${t(id)}/roles/${encodeURIComponent(userId)}`, { method: 'DELETE', token }),

    // ---- teams / roster ----
    myInvites: (token: string) => call<MyInvite[]>('/my-invites', { token }),
    listTeams: (id: string, opts: { status?: TeamStatus } = {}, token?: string) =>
        call<{ tournamentId: string; teams: TournamentTeam[] }>(`${t(id)}/teams${buildQuery({ status: opts.status })}`, { token }),
    getTeam: (id: string, teamId: string, token?: string) => call<TournamentTeam>(tm(id, teamId), { token }),
    createTeam: (id: string, data: CreateTeamInput, token: string) =>
        call<{ team: TournamentTeam; waitlisted: boolean }>(`${t(id)}/teams`, { method: 'POST', data, token }),
    patchTeam: (id: string, teamId: string, data: PatchTeamInput, token: string) =>
        call<TournamentTeam>(tm(id, teamId), { method: 'PATCH', data, token }),
    withdrawTeam: (id: string, teamId: string, token: string) =>
        call<{ ok: true; affectedMatchIds: string[]; promotedTeamIds: string[] }>(tm(id, teamId), { method: 'DELETE', token }),
    decideTeam: (id: string, teamId: string, decision: TeamDecision, token: string) =>
        call<{ team: TournamentTeam; promotedTeamIds: string[] }>(`${tm(id, teamId)}/decision`, {
            method: 'POST',
            data: { decision },
            token,
        }),
    rotateJoinCode: (id: string, teamId: string, token: string) =>
        call<{ joinCode: string }>(`${tm(id, teamId)}/join-code/rotate`, { method: 'POST', token }),
    inviteMember: (id: string, teamId: string, userId: string, token: string) =>
        call<{ member: TeamMember }>(`${tm(id, teamId)}/members`, { method: 'POST', data: { userId }, token }),
    respondToInvite: (id: string, teamId: string, userId: string, accept: boolean, token: string) =>
        call<{ member: TeamMember; accepted: boolean }>(`${tm(id, teamId)}/members/${encodeURIComponent(userId)}/respond`, {
            method: 'POST',
            data: { accept },
            token,
        }),
    patchMember: (id: string, teamId: string, userId: string, data: PatchMemberInput, token: string) =>
        call<TeamMember>(`${tm(id, teamId)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', data, token }),
    removeMember: (id: string, teamId: string, userId: string, token: string) =>
        call<{ ok: true }>(`${tm(id, teamId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE', token }),
    joinByCode: (id: string, joinCode: string, token: string) =>
        call<{ member: TeamMember; team: TournamentTeam }>(`${t(id)}/join/${encodeURIComponent(joinCode)}`, {
            method: 'POST',
            token,
        }),

    // ---- schedule / matches ----
    /** Dry run: `POST /:id/schedule/generate?preview=1`. Nothing is saved. */
    previewSchedule: (id: string, data: ScheduleGenerateInput, token: string) =>
        call<SchedulePreviewResponse>(`${t(id)}/schedule/generate?preview=1`, { method: 'POST', data, token }),
    /** Commit the schedule. Throws SCHEDULE_HAS_RESULTS / SCHEDULE_CONFLICTS (ScheduleConflictError). */
    generateSchedule: (id: string, data: ScheduleGenerateInput, token: string) =>
        call<ScheduleCommitResponse>(`${t(id)}/schedule/generate`, { method: 'POST', data, token }),
    createMatch: (id: string, data: CreateMatchInput, token: string) =>
        call<MatchWithConflicts>(`${t(id)}/matches`, { method: 'POST', data, token }),
    patchMatch: (id: string, matchId: string, data: PatchMatchInput, token: string) =>
        call<MatchWithConflicts>(`${t(id)}/matches/${encodeURIComponent(matchId)}`, { method: 'PATCH', data, token }),
    deleteMatch: (id: string, matchId: string, token: string) =>
        call<{ ok: true }>(`${t(id)}/matches/${encodeURIComponent(matchId)}`, { method: 'DELETE', token }),
    /** Throws VersionConflictError / DownstreamFinishedError for the 409 cases. */
    saveResult: (id: string, matchId: string, data: SaveMatchResultInput, token: string) =>
        call<SaveMatchResultResponse>(`${t(id)}/matches/${encodeURIComponent(matchId)}/result`, {
            method: 'PUT',
            data,
            token,
        }),

    // ---- computed views ----
    schedule: (id: string, filters: ScheduleFilters = {}, token?: string) =>
        call<TournamentSchedule>(`${t(id)}/schedule${buildQuery({ ...filters })}`, { token }),
    standings: (id: string, token?: string) => call<StandingsResponse>(`${t(id)}/standings`, { token }),
    /** Manager+: publish a manual order. Points adjustments are additive and do not re-sort. */
    putStandingsOverride: (id: string, data: StandingsOverrideInput, token: string) =>
        call<StandingsOverrideResult>(`${t(id)}/standings/override`, { method: 'PUT', data, token }),
    /** Manager+: delete the override so the table is automatic again. */
    deleteStandingsOverride: (id: string, data: { stageId: string; groupId: string | null }, token: string) =>
        call<StandingsOverrideResult>(`${t(id)}/standings/override`, { method: 'DELETE', data, token }),
    bracket: (id: string, token?: string) => call<BracketResponse>(`${t(id)}/bracket`, { token }),
    leaders: (id: string, opts: { key?: string; limit?: number } = {}, token?: string) =>
        call<LeadersResponse>(`${t(id)}/stats/leaders${buildQuery({ ...opts })}`, { token }),
};
