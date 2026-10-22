"use client";

import { useAuth } from "@clerk/nextjs";
import { useTournamentCapabilities, useTournaments } from "@/hooks/tournaments";

/**
 * Nav entry rule (spec 1.1): show the tournaments link only when the viewer can create tournaments or at least one
 * public tournament exists. Nothing is rendered while either answer is still loading.
 */
export function useTournamentsNav(): boolean {
    const { isSignedIn } = useAuth();
    const caps = useTournamentCapabilities();
    const { data } = useTournaments({ limit: 1 });
    return (isSignedIn && caps.canCreateTournaments) || (data?.length ?? 0) > 0;
}
