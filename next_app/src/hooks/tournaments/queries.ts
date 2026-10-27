import { useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { tournamentsApi } from '@/services/api/tournaments';
import { groupNameMap, matchNumberMap } from '@/utils/tournament';
import type {
    BracketResponse,
    LeadersResponse,
    MyInvite,
    ScheduleFilters,
    StandingsResponse,
    TeamStatus,
    Tournament,
    TournamentDetail,
    TournamentFilters,
    TournamentSchedule,
    TournamentTeam,
    TournamentUpdateType,
} from '@/types/tournament';
import { useResource, useTournamentLive, type LiveState, type ResourceState } from './internal';

export interface LiveOptions {
    /** Subscribe to `tournament:update` and refetch. Default true. */
    live?: boolean;
}

function useLiveResource<T>(
    tournamentId: string | null | undefined,
    fetcher: (token: string | undefined) => Promise<T>,
    types: readonly TournamentUpdateType[],
    live: boolean
): ResourceState<T> & LiveState {
    const res = useResource(fetcher, { enabled: !!tournamentId, auth: 'optional' });
    const { reload } = res;
    const state = useTournamentLive(tournamentId, types, reload, live);
    return { ...res, ...state };
}

/**
 * Feature visibility (`canView`: tournaments are public or the viewer is allowed in) and the "create tournament" entry
 * points (`canCreateTournaments`). Both are `false` while loading; guests get `canView` = the public switch.
 */
export function useTournamentCapabilities(): { canView: boolean; canCreateTournaments: boolean; loading: boolean; error: ResourceState<unknown>['error']; reload: () => Promise<void> } {
    const { isSignedIn } = useAuth();
    // Tag the answer with who asked: right after sign-in/out the previous (guest/user) answer is still
    // in state for one render and must not drive a notFound()/redirect.
    const fetcher = useCallback(async (token: string | undefined) => ({ ...(await tournamentsApi.capabilities(token)), asSignedIn: token !== undefined }), []);
    const { data, loading, error, reload } = useResource(fetcher, { auth: 'optional' });
    const stale = !!data && data.asSignedIn !== !!isSignedIn;
    const fresh = stale ? null : data;
    return { canView: fresh?.canView === true, canCreateTournaments: (fresh?.canCreate ?? fresh?.canCreateTournaments) === true, loading: loading || stale, error, reload };
}

/** Tournament summaries. `filters` is compared by value, so an inline object literal is fine. */
export function useTournaments(filters: TournamentFilters = {}): ResourceState<Tournament[]> {
    const key = JSON.stringify(filters);
    const fetcher = useCallback((token: string | undefined) => tournamentsApi.list(JSON.parse(key), token), [key]);
    return useResource(fetcher, { auth: 'optional' });
}

/**
 * One tournament with `myRole`, `myTeam`, `counts` and `capabilities`. Joins the socket room and refetches on any
 * `tournament:update`; `updated` drives `<UpdatedCue>`. A hidden/missing tournament has `error.status === 404`.
 */
export function useTournament(id: string | null | undefined, { live = true }: LiveOptions = {}) {
    const fetcher = useCallback((token: string | undefined) => tournamentsApi.get(id as string, token), [id]);
    const r = useLiveResource<TournamentDetail>(id, fetcher, ALL_TYPES, live);
    return { ...r, tournament: r.data, notFound: r.error?.status === 404 };
}
const ALL_TYPES: readonly TournamentUpdateType[] = ['teams', 'schedule', 'result', 'status'];

/** Teams visible to the viewer (public: APPROVED only). Refetches on `teams` / `status` events. */
export function useTournamentTeams(id: string | null | undefined, opts: { status?: TeamStatus } & LiveOptions = {}) {
    const { status, live = true } = opts;
    const fetcher = useCallback(
        async (token: string | undefined) => (await tournamentsApi.listTeams(id as string, { status }, token)).teams,
        [id, status]
    );
    const r = useLiveResource<TournamentTeam[]>(id, fetcher, ['teams', 'status'], live);
    return { ...r, teams: r.data ?? EMPTY_TEAMS };
}
const EMPTY_TEAMS: TournamentTeam[] = [];

/** Pending team invites of the signed-in user (empty when signed out). Not realtime: call `reload` after responding. */
export function useMyInvites() {
    const fetcher = useCallback((token: string | undefined) => tournamentsApi.myInvites(token as string), []);
    const r = useResource<MyInvite[]>(fetcher, { auth: 'required' });
    return { ...r, invites: r.data ?? EMPTY_INVITES };
}
const EMPTY_INVITES: MyInvite[] = [];

/**
 * Stages + matches. Also returns `matchNumberById` / `groupNameById` ready to pass as `SlotContext` to
 * `describeSlot` / `<SlotLabel>`. Refetches on `schedule` / `result` / `status`.
 */
export function useTournamentSchedule(id: string | null | undefined, filters: ScheduleFilters = {}, opts: LiveOptions = {}) {
    const key = JSON.stringify(filters);
    const fetcher = useCallback(
        (token: string | undefined) => tournamentsApi.schedule(id as string, JSON.parse(key), token),
        [id, key]
    );
    const r = useLiveResource<TournamentSchedule>(id, fetcher, ['schedule', 'result', 'status'], opts.live ?? true);
    const matches = r.data?.matches;
    const stages = r.data?.stages;
    const matchNumberById = useMemo(() => matchNumberMap(matches ?? []), [matches]);
    const groupNameById = useMemo(() => groupNameMap(stages ?? []), [stages]);
    return { ...r, schedule: r.data, stages: stages ?? [], matches: matches ?? [], matchNumberById, groupNameById };
}

/** Standings tables per stage/group. Refetches on `result` / `schedule` / `teams` / `status`. */
export function useStandings(id: string | null | undefined, opts: LiveOptions = {}) {
    const fetcher = useCallback((token: string | undefined) => tournamentsApi.standings(id as string, token), [id]);
    const r = useLiveResource<StandingsResponse>(id, fetcher, ALL_TYPES, opts.live ?? true);
    return { ...r, tables: r.data?.tables ?? EMPTY_TABLES };
}
const EMPTY_TABLES: StandingsResponse['tables'] = [];

/** Knockout bracket stages. Refetches on `result` / `schedule` / `status`. */
export function useBracket(id: string | null | undefined, opts: LiveOptions = {}) {
    const fetcher = useCallback((token: string | undefined) => tournamentsApi.bracket(id as string, token), [id]);
    const r = useLiveResource<BracketResponse>(id, fetcher, ['schedule', 'result', 'status'], opts.live ?? true);
    return { ...r, stages: r.data?.stages ?? EMPTY_STAGES };
}
const EMPTY_STAGES: BracketResponse['stages'] = [];

/** Top players for a stat `key` (default chosen by the server; `data.keys` lists the options). Refetches on `result`. */
export function useLeaders(id: string | null | undefined, opts: { key?: string; limit?: number } & LiveOptions = {}) {
    const { key, limit, live = true } = opts;
    const fetcher = useCallback((token: string | undefined) => tournamentsApi.leaders(id as string, { key, limit }, token), [id, key, limit]);
    const r = useLiveResource<LeadersResponse>(id, fetcher, ['result'], live);
    return { ...r, leaders: r.data?.leaders ?? EMPTY_LEADERS };
}
const EMPTY_LEADERS: LeadersResponse['leaders'] = [];
