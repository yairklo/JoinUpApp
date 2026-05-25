import { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { gamesApi } from '@/services/api';
import { useSyncedGames } from './useSyncedGames';

export function useMyGames() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const userId = user?.id || "";

    // We pass [] as initial games, useSyncedGames handles the game list state
    const { games, setGames } = useSyncedGames([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded) return;
        if (!userId) {
            setLoading(false);
            return;
        }

        let ignore = false;
        async function fetchMyGames() {
            try {
                const token = await getToken();
                if (!token) return; // Should allow generic error or empty state?

                const myGames = await gamesApi.getMyGames(token);

                // Deduplicate by seriesId
                const uniqueSeries = new Set<string>();
                const dedupedGames = myGames.filter((g) => {
                    if (!g.seriesId) return true;
                    if (uniqueSeries.has(g.seriesId)) return false;
                    uniqueSeries.add(g.seriesId);
                    return true;
                });

                if (!ignore) setGames(dedupedGames);
            } catch (error) {
                console.error("Failed to load my games", error);
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        fetchMyGames();
        return () => { ignore = true; };
    }, [userId, isLoaded, getToken, setGames]);

    return { games, loading, userId, isLoaded };
}
