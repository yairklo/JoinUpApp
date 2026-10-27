import { apiClient } from './client';
import type {
    BracketResponse,
    CreateMatchInput,
    CreateTeamInput,
    LeadersResponse,
    MatchMutationResponse,
    MyInvite,
    SaveMatchResultInput,
    SaveMatchResultResponse,
    ScheduleCommitResponse,
    ScheduleFilters,
    ScheduleGenerateInput,
    SchedulePreviewResponse,
    ScheduleResponse,
    StandingsOverrideInput,
    StandingsOverrideResult,
    StandingsResponse,
    TeamDecision,
    TeamMember,
    TeamsResponse,
    Tournament,
    TournamentAssignableRole,
    TournamentDetail,
    TournamentFilters,
    TournamentInput,
    TournamentPatch,
    TournamentRoleRow,
    TournamentStatus,
    TournamentTeam,
    UpdateMatchInput,
    UpdateTeamInput,
} from '@/types/tournament';

type Opts = { signal?: AbortSignal };

const base = (id: string) => `/api/tournaments/${encodeURIComponent(id)}`;
const csv = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v);

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '' || v === false) continue;
        parts.push(`${k}=${encodeURIComponent(v === true ? '1' : String(v))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Typed client for /api/tournaments (contract: docs/plans/2026-10-tournaments-api-contract.md).
 * `token` is optional on reads (guests allowed, drafts hidden -> 404) and required elsewhere.
 * Failures reject with an apiClient error: `err.status`, `err.code` (TournamentErrorCode) and
 * `err.body` (the full JSON, e.g. `{ currentVersion }`, `{ problems }`, `{ conflicts }`).
 * Map them with `tournamentErrorKey` / `tournamentErrorParams` (utils/tournamentErrors.ts).
 */
export const tournamentsApi = {
    getCapabilities: (token: string | undefined, opts: Opts = {}) =>
        apiClient<{ public: boolean; canView: boolean; canCreate: boolean; canCreateTournaments?: boolean }>('/api/tournaments/capabilities', { token, cache: 'no-store', ...opts }),

    list: (filters: TournamentFilters, token: string | undefined, opts: Opts = {}) =>
        apiClient<Tournament[]>(
            `/api/tournaments${qs({
                status: csv(filters.status),
                sport: filters.sport,
                city: filters.city,
                mine: filters.mine,
                limit: filters.limit,
                offset: filters.offset,
            })}`,
            { token, cache: 'no-store', ...opts }
        ),

    create: (data: TournamentInput, token: string) =>
        apiClient<Tournament>('/api/tournaments', { method: 'POST', data, token }),

    get: (id: string, token: string | undefined, opts: Opts = {}) =>
        apiClient<TournamentDetail>(base(id), { token, cache: 'no-store', ...opts }),

    update: (id: string, data: TournamentPatch, token: string) =>
        apiClient<Tournament>(base(id), { method: 'PATCH', data, token }),

    setStatus: (id: string, data: { status: TournamentStatus; force?: boolean }, token: string) =>
        apiClient<Tournament & { previousStatus: TournamentStatus }>(`${base(id)}/status`, { method: 'POST', data, token }),

    // ---- roles
    listRoles: (id: string, token: string, opts: Opts = {}) =>
        apiClient<TournamentRoleRow[]>(`${base(id)}/roles`, { token, cache: 'no-store', ...opts }),

    addRole: (id: string, data: { userId: string; role: TournamentAssignableRole }, token: string) =>
        apiClient<{ userId: string; role: TournamentAssignableRole }>(`${base(id)}/roles`, { method: 'POST', data, token }),

    removeRole: (id: string, userId: string, token: string) =>
        apiClient<{ ok: true }>(`${base(id)}/roles/${encodeURIComponent(userId)}`, { method: 'DELETE', token }),

    // ---- teams
    createTeam: (id: string, data: CreateTeamInput, token: string) =>
        apiClient<{ team: TournamentTeam; waitlisted: boolean }>(`${base(id)}/teams`, { method: 'POST', data, token }),

    listTeams: (id: string, status: string | undefined, token: string | undefined, opts: Opts = {}) =>
        apiClient<TeamsResponse>(`${base(id)}/teams${qs({ status })}`, { token, cache: 'no-store', ...opts }),

    getTeam: (id: string, teamId: string, token: string | undefined, opts: Opts = {}) =>
        apiClient<TournamentTeam>(`${base(id)}/teams/${encodeURIComponent(teamId)}`, { token, cache: 'no-store', ...opts }),

    updateTeam: (id: string, teamId: string, data: UpdateTeamInput, token: string) =>
        apiClient<TournamentTeam>(`${base(id)}/teams/${encodeURIComponent(teamId)}`, { method: 'PATCH', data, token }),

    withdrawTeam: (id: string, teamId: string, token: string) =>
        apiClient<{ ok: true; affectedMatchIds: string[]; promotedTeamIds: string[] }>(
            `${base(id)}/teams/${encodeURIComponent(teamId)}`,
            { method: 'DELETE', token }
        ),

    decideTeam: (id: string, teamId: string, decision: TeamDecision, token: string) =>
        apiClient<{ team: TournamentTeam; promotedTeamIds: string[] }>(
            `${base(id)}/teams/${encodeURIComponent(teamId)}/decision`,
            { method: 'POST', data: { decision }, token }
        ),

    rotateJoinCode: (id: string, teamId: string, token: string) =>
        apiClient<{ joinCode: string }>(`${base(id)}/teams/${encodeURIComponent(teamId)}/join-code/rotate`, { method: 'POST', token }),

    inviteMember: (id: string, teamId: string, userId: string, token: string) =>
        apiClient<{ member: TeamMember }>(`${base(id)}/teams/${encodeURIComponent(teamId)}/members`, {
            method: 'POST',
            data: { userId },
            token,
        }),

    respondToInvite: (id: string, teamId: string, userId: string, accept: boolean, token: string) =>
        apiClient<{ member: TeamMember; accepted: boolean }>(
            `${base(id)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/respond`,
            { method: 'POST', data: { accept }, token }
        ),

    updateMember: (
        id: string,
        teamId: string,
        userId: string,
        data: { jerseyNumber?: number | null; role?: 'PLAYER' | 'SUBSTITUTE' },
        token: string
    ) =>
        apiClient<TeamMember>(`${base(id)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            data,
            token,
        }),

    removeMember: (id: string, teamId: string, userId: string, token: string) =>
        apiClient<{ ok: true }>(`${base(id)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            token,
        }),

    joinByCode: (id: string, joinCode: string, token: string) =>
        apiClient<{ member: TeamMember; team: TournamentTeam }>(`${base(id)}/join/${encodeURIComponent(joinCode)}`, {
            method: 'POST',
            token,
        }),

    getMyInvites: (token: string, opts: Opts = {}) =>
        apiClient<MyInvite[]>('/api/tournaments/my-invites', { token, cache: 'no-store', ...opts }),

    // ---- schedule and matches
    getSchedule: (id: string, filters: ScheduleFilters, token: string | undefined, opts: Opts = {}) =>
        apiClient<ScheduleResponse>(
            `${base(id)}/schedule${qs({
                teamId: filters.teamId,
                status: csv(filters.status),
                stageId: filters.stageId,
                from: filters.from,
                to: filters.to,
            })}`,
            { token, cache: 'no-store', ...opts }
        ),

    previewSchedule: (id: string, data: ScheduleGenerateInput, token: string) =>
        apiClient<SchedulePreviewResponse>(`${base(id)}/schedule/generate?preview=1`, { method: 'POST', data, token }),

    generateSchedule: (id: string, data: ScheduleGenerateInput, token: string) =>
        apiClient<ScheduleCommitResponse>(`${base(id)}/schedule/generate`, { method: 'POST', data, token }),

    createMatch: (id: string, data: CreateMatchInput, token: string) =>
        apiClient<MatchMutationResponse>(`${base(id)}/matches`, { method: 'POST', data, token }),

    updateMatch: (id: string, matchId: string, data: UpdateMatchInput, token: string) =>
        apiClient<MatchMutationResponse>(`${base(id)}/matches/${encodeURIComponent(matchId)}`, { method: 'PATCH', data, token }),

    deleteMatch: (id: string, matchId: string, token: string) =>
        apiClient<{ ok: true }>(`${base(id)}/matches/${encodeURIComponent(matchId)}`, { method: 'DELETE', token }),

    saveResult: (id: string, matchId: string, data: SaveMatchResultInput, token: string) =>
        apiClient<SaveMatchResultResponse>(`${base(id)}/matches/${encodeURIComponent(matchId)}/result`, {
            method: 'PUT',
            data,
            token,
        }),

    // ---- computed views
    getStandings: (id: string, token: string | undefined, opts: Opts = {}) =>
        apiClient<StandingsResponse>(`${base(id)}/standings`, { token, cache: 'no-store', ...opts }),

    /** Manager+: publish a manual order. Points adjustments are additive and do not re-sort. */
    putStandingsOverride: (id: string, data: StandingsOverrideInput, token: string) =>
        apiClient<StandingsOverrideResult>(`${base(id)}/standings/override`, { method: 'PUT', data, token }),

    /** Manager+: delete the override so the table is automatic again. */
    deleteStandingsOverride: (id: string, data: { stageId: string; groupId: string | null }, token: string) =>
        apiClient<StandingsOverrideResult>(`${base(id)}/standings/override`, { method: 'DELETE', data, token }),

    getBracket: (id: string, token: string | undefined, opts: Opts = {}) =>
        apiClient<BracketResponse>(`${base(id)}/bracket`, { token, cache: 'no-store', ...opts }),

    getLeaders: (id: string, key: string | undefined, limit: number | undefined, token: string | undefined, opts: Opts = {}) =>
        apiClient<LeadersResponse>(`${base(id)}/stats/leaders${qs({ key, limit })}`, { token, cache: 'no-store', ...opts }),
};
