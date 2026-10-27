"use client";

import { notFound } from "next/navigation";
import { useTournamentCapabilities } from "@/hooks/tournaments";

/** Hides the whole /tournaments tree (404) from viewers the server does not let into the feature. */
export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
    const { canView, loading, error } = useTournamentCapabilities();
    if (loading) return null;
    // A failed capabilities call must not lock allowed users out: the server gate is the real check.
    if (!canView && !error) notFound();
    return <>{children}</>;
}
