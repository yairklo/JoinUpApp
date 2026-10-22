import { tournamentsApi } from '@/services/api/tournaments';
import { useTournamentLive, useTournamentQuery } from './useTournamentQuery';
import type {
    BracketResponse,
    LeadersResponse,
    ScheduleFilters,
    ScheduleResponse,
    StandingsResponse,
    TeamsResponse,
    TournamentTeam,
    TournamentUpdateType,
} from '@/types/tournament';

/**
 * Shared shape of the realtime-aware view hooks: loads on mount / key change, refetches (without a
 * loading flash) when a relevant `tournament:update` arrives, exposes the cue state.
 */
function useLiveView<T>(
    id: string | undefined,
    scope: string,
    fetcher: (token: string | undefined, signal: AbortSignal) => Promise<T>,
    types?: TournamentUpdateType[]
) {
    const q = useTournamentQuery<T>(`${scope}:${id}`, fetcher, { enabled: !!id });
    const live = useTournamentLive(id, () => {
        void q.refetch();
    }, types);
    return {
        data: q.data,
        loading: q.loading,
        error: q.error,
        notFound: q.notFound,
        refetch: q.refetch,
        updated: live.updated,
        changedMatchIds: live.changedMatchIds,
    };
}

/** Teams of a tournament (public viewers: APPROVED only). Optional `status` filter. Each team has `isMine`. */
export function useTournamentTeams(id: string | undefined, status?: string) {
    const v = useLiveView<TeamsResponse>(id, `teams:${status ?? ''}`, (token, signal) =>
        tournamentsApi.listTeams(id as string, status, token, { signal })
    );
    const teams: TournamentTeam[] = v.data?.teams ?? [];
    return { teams, loading: v.loading, error: v.error, notFound: v.notFound, refetch: v.refetch, updated: v.updated };
}

/**
 * Stages + matches (with filters, compared by value). Use `numberById` to render `SlotLabel` sources
 * (`WINNER_OF`/`LOSER_OF` carry a matchId; the label needs the match number).
 */
export function useTournamentSchedule(id: string | undefined, filters: ScheduleFilters = {}) {
    const v = useLiveView<ScheduleResponse>(id, `schedule:${JSON.stringify(filters)}`, (token, signal) =>
        tournamentsApi.getSchedule(id as string, filters, token, { signal })
    );
    const matches = v.data?.matches ?? [];
    const numberById: Record<string, number> = {};
    for (const m of matches) numberById[m.id] = m.number;
    return {
        stages: v.data?.stages ?? [],
        matches,
        numberById,
        loading: v.loading,
        error: v.error,
        notFound: v.notFound,
        refetch: v.refetch,
        updated: v.updated,
        changedMatchIds: v.changedMatchIds,
    };
}

/** Group/league tables. Refetches on results and status/schedule/teams changes. */
export function useStandings(id: string | undefined) {
    const v = useLiveView<StandingsResponse>(id, 'standings', (token, signal) =>
        tournamentsApi.getStandings(id as string, token, { signal })
    );
    return { tables: v.data?.tables ?? [], loading: v.loading, error: v.error, notFound: v.notFound, refetch: v.refetch, updated: v.updated };
}

/** Knockout rounds per stage. */
export function useBracket(id: string | undefined) {
    const v = useLiveView<BracketResponse>(id, 'bracket', (token, signal) =>
        tournamentsApi.getBracket(id as string, token, { signal })
    );
    return {
        stages: v.data?.stages ?? [],
        loading: v.loading,
        error: v.error,
        notFound: v.notFound,
        refetch: v.refetch,
        updated: v.updated,
        changedMatchIds: v.changedMatchIds,
    };
}

/**
 * Top players for one stat `key` (omit for the server default). `keys` lists selectable stats and
 * `label` is `{he,en}`. Refetches on `result` events only.
 */
export function useLeaders(id: string | undefined, key?: string, limit?: number) {
    const v = useLiveView<LeadersResponse>(
        id,
        `leaders:${key ?? ''}:${limit ?? ''}`,
        (token, signal) => tournamentsApi.getLeaders(id as string, key, limit, token, { signal }),
        ['result']
    );
    return {
        leaders: v.data?.leaders ?? [],
        keys: v.data?.keys ?? [],
        key: v.data?.key ?? key,
        label: v.data?.label ?? null,
        loading: v.loading,
        error: v.error,
        notFound: v.notFound,
        refetch: v.refetch,
        updated: v.updated,
    };
}
