import { tournamentsApi } from '@/services/api/tournaments';
import { useTournamentLive, useTournamentQuery } from './useTournamentQuery';
import type { TournamentTeam } from '@/types/tournament';

/**
 * One team with its roster (`members`, `joinCode` for captain / manager). Refetches on every
 * `tournament:update` for the tournament so approvals and roster changes appear without a reload.
 */
export function useTournamentTeam(tournamentId: string | undefined, teamId: string | undefined) {
    const q = useTournamentQuery<TournamentTeam>(
        `team:${tournamentId}:${teamId}`,
        (token, signal) => tournamentsApi.getTeam(tournamentId as string, teamId as string, token, { signal }),
        { enabled: !!tournamentId && !!teamId }
    );
    const live = useTournamentLive(tournamentId, () => {
        void q.refetch();
    });
    return { team: q.data, loading: q.loading, error: q.error, notFound: q.notFound, refetch: q.refetch, updated: live.updated };
}
