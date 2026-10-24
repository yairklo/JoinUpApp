import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useUserStats } from '@/hooks/useUserStats';
import ProfileStatsCard from '@/components/ProfileStatsCard';

interface ProfileStatsProps {
    userId: string;
    isOwner?: boolean;
}

/** Thin container: loads a user's aggregated stats and renders ProfileStatsCard. */
export default function ProfileStats({ userId, isOwner = false }: ProfileStatsProps) {
    const router = useRouter();
    const { data, loading, error, refresh } = useUserStats(userId);
    const [sport, setSport] = useState<string | null>(null);

    const state = loading && !data ? 'loading' : error && !data ? 'error' : 'ready';

    return (
        <ProfileStatsCard
            state={state}
            visible={data?.visible ?? false}
            isOwner={isOwner}
            ownerHidden={data?.ownerHidden}
            sports={data?.sports ?? []}
            selectedSport={sport}
            onSelectSport={setSport}
            onRetry={refresh}
            onOpenSettings={isOwner ? () => router.push('/profile/settings' as any) : undefined}
        />
    );
}
