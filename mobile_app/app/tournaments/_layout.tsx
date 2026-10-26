import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTournamentCapabilities } from '@/hooks/useTournaments';

/**
 * Gates every screen under app/tournaments/*. Until the server's `tournamentsPublic` switch is on,
 * only admins, creators and role holders get `canView`; everyone else is sent home. The server
 * enforces the same rule, so this only keeps deep links from rendering a dead screen.
 */
export default function TournamentsLayout() {
    const { canView, loading, error } = useTournamentCapabilities();
    const router = useRouter();
    // A failed capabilities call must not lock allowed users out: the server gate is the real check.
    const blocked = !loading && !error && !canView;

    useEffect(() => {
        if (blocked) router.replace('/(tabs)');
    }, [blocked, router]);

    if (loading || blocked) return null;
    return <Stack screenOptions={{ headerShown: false }} />;
}
