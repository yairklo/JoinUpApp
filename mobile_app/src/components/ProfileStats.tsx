import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useUserStats } from '@/hooks/useUserStats';
import ProfileStatsCard from '@/components/ProfileStatsCard';

interface ProfileStatsProps {
    userId: string;
    isOwner?: boolean;
    /** Owner's own `hideMatchStats` setting (from the profile's privacySettings); undefined = unknown, no banner. */
    ownerHidden?: boolean;
}

/** Thin container: loads a user's aggregated stats and renders ProfileStatsCard. */
export default function ProfileStats({ userId, isOwner = false, ownerHidden }: ProfileStatsProps) {
    const router = useRouter();
    const { data, loading, error, refresh } = useUserStats(userId);
    const [sport, setSport] = useState<string | null>(null);

    const state = loading && !data ? 'loading' : error && !data ? 'error' : 'ready';

    return (
        <ProfileStatsCard
            state={state}
            visible={data?.visible ?? false}
            isOwner={isOwner}
            ownerHidden={ownerHidden}
            sports={data?.sports ?? []}
            selectedSport={sport}
            onSelectSport={setSport}
            onRetry={refresh}
            onOpenSettings={isOwner ? () => router.push('/profile/settings' as any) : undefined}
        />
    );
}
