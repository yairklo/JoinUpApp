"use client";

import { useState } from "react";
import { useUserStats } from "@/hooks/useUserStats";
import ProfileStatsCard from "@/components/ProfileStatsCard";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

/** Thin container: loads a user's stats and feeds the presentational card. Hidden stats render nothing. */
export default function ProfileStatsSection({
    userId,
    isOwner,
    ownerHidden,
}: {
    userId: string;
    isOwner?: boolean;
    /** Owner's own hideMatchStats flag when known (no banner otherwise). */
    ownerHidden?: boolean;
}) {
    const { data, loading, error, reload } = useUserStats(userId);
    const [selectedSport, setSelectedSport] = useState<string | null>(null);

    const state = loading && !data ? "loading" : error && !data ? "error" : "ready";
    return (
        <SectionErrorBoundary label="סטטיסטיקות">
            <ProfileStatsCard
                state={state}
                visible={state !== "ready" || data?.visible !== false}
                isOwner={isOwner}
                ownerHidden={ownerHidden}
                sports={data?.sports ?? []}
                selectedSport={selectedSport}
                onSelectSport={setSelectedSport}
                onRetry={reload}
            />
        </SectionErrorBoundary>
    );
}
