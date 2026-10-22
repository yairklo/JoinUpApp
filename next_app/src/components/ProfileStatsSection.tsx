"use client";

import { useState } from "react";
import { useUserStats } from "@/hooks/useUserStats";
import ProfileStatsCard from "@/components/ProfileStatsCard";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

/** Thin container: loads a user's stats and feeds the presentational card. Hidden stats render nothing. */
export default function ProfileStatsSection({
    userId,
    isOwner,
}: {
    userId: string;
    isOwner?: boolean;
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
                ownerHidden={data?.ownerHidden}
                sports={data?.sports ?? []}
                selectedSport={selectedSport}
                onSelectSport={setSelectedSport}
                onRetry={reload}
            />
        </SectionErrorBoundary>
    );
}
