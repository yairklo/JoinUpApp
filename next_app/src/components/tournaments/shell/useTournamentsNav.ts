"use client";

import { useTournamentCapabilities } from "@/hooks/tournaments";

/**
 * Nav entry rule: show the tournaments link only when the server says this viewer may see the feature
 * (tournaments switched on for everyone, or the viewer is an admin / creator / role holder).
 */
export function useTournamentsNav(): boolean {
    return useTournamentCapabilities().canView;
}
