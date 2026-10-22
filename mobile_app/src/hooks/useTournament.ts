import { tournamentsApi } from '@/services/api/tournaments';
import { useTournamentLive, useTournamentQuery } from './useTournamentQuery';
import type { TournamentDetail } from '@/types/tournament';

/**
 * One tournament with `myRole`, `myTeam`, `counts` and `capabilities`. Joins the socket room and
 * refetches on every `tournament:update`. `notFound` covers hidden drafts / private tournaments (404).
 * `updated` drives `<UpdatedCue visible={updated} />`; `changedMatchIds` the row flash.
 */
export function useTournament(id: string | undefined) {
    const q = useTournamentQuery<TournamentDetail>(
        `detail:${id}`,
        (token, signal) => tournamentsApi.get(id as string, token, { signal }),
        { enabled: !!id }
    );
    const live = useTournamentLive(id, () => {
        void q.refetch();
    });
    return {
        tournament: q.data,
        loading: q.loading,
        error: q.error,
        notFound: q.notFound,
        refetch: q.refetch,
        updated: live.updated,
        changedMatchIds: live.changedMatchIds,
        lastEvent: live.lastEvent,
    };
}
