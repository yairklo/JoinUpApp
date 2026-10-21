import { useAuth } from '@clerk/clerk-expo';
import { tournamentsApi } from '@/services/api/tournaments';
import { useTournamentQuery } from './useTournamentQuery';
import type { MyInvite, Tournament, TournamentFilters } from '@/types/tournament';

/**
 * Whether the viewer may create tournaments (admin or creator allow-list). Hide create entry points
 * unless `canCreate` (spec 0.8: hide, never disable). Signed-out or on error: `canCreate=false`.
 */
export function useTournamentCapabilities() {
    const q = useTournamentQuery('capabilities', (token, signal) => tournamentsApi.getCapabilities(token as string, { signal }), {
        requireAuth: true,
    });
    return { canCreate: q.data?.canCreateTournaments === true, loading: q.loading, error: q.error, refetch: q.refetch };
}

/**
 * Tournament summaries (no `rules`; has `approvedTeams`). Guests see public non-draft tournaments.
 * `filters` is compared by value, so an inline object literal is fine. Refetches when it changes.
 * Pagination: pass `limit`/`offset` and call `refetch`; no infinite scroll in the hook.
 */
export function useTournaments(filters: TournamentFilters = {}) {
    const { isSignedIn } = useAuth();
    const key = `list:${JSON.stringify(filters)}:${isSignedIn ? 'u' : 'g'}`;
    const q = useTournamentQuery<Tournament[]>(key, (token, signal) => tournamentsApi.list(filters, token, { signal }));
    return { tournaments: q.data ?? [], loading: q.loading, error: q.error, refetch: q.refetch };
}

/** Pending team invites for the signed-in viewer (`count` feeds `tournaments.invitesButton`). */
export function useMyInvites() {
    const q = useTournamentQuery<MyInvite[]>('my-invites', (token, signal) => tournamentsApi.getMyInvites(token as string, { signal }), {
        requireAuth: true,
    });
    const invites = q.data ?? [];
    return { invites, count: invites.length, loading: q.loading, error: q.error, refetch: q.refetch };
}
