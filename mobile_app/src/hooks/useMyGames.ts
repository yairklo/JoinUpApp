import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { gamesApi } from '@/services/api';
import { useSyncedGames } from './useSyncedGames';
import type { Game } from '@/types/game';

function isMyGame(game: Game, userId?: string | null) {
    if (!userId) return false;
    if (game.organizerId === userId) return true;
    if (game.participants?.some((p) => p.id === userId)) return true;
    const status = game.viewerParticipationStatus;
    return status === 'CONFIRMED' || status === 'WAITLISTED' || status === 'PENDING';
}

export function useMyGames() {
    const { user, isLoaded } = useUser();
    const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
    const userId = user?.id || '';

    const { games, setGames } = useSyncedGames([], (game) => isMyGame(game, userId));
    const [loading, setLoading] = useState(true);

    const fetchMyGames = useCallback(async () => {
        if (!isLoaded || !isAuthLoaded) return;
        if (!userId) {
            setLoading(false);
            return;
        }

        try {
            let token: string | null = null;
            if (isSignedIn) {
                token = await getToken();
                if (!token) {
                    await new Promise((r) => setTimeout(r, 400));
                    token = await getToken();
                }
            }
            if (!token) return;

            const myGames = await gamesApi.getMyGames(token);

            const uniqueSeries = new Set<string>();
            const dedupedGames = myGames.filter((g) => {
                if (!g.seriesId) return true;
                if (uniqueSeries.has(g.seriesId)) return false;
                uniqueSeries.add(g.seriesId);
                return true;
            });

            setGames(dedupedGames);
        } catch (error) {
            console.error('Failed to load my games', error);
        } finally {
            setLoading(false);
        }
    }, [userId, isLoaded, isAuthLoaded, isSignedIn, getToken, setGames]);

    useEffect(() => {
        fetchMyGames();
    }, [fetchMyGames]);

    useFocusEffect(
        useCallback(() => {
            fetchMyGames();
        }, [fetchMyGames])
    );

    return { games, loading, userId, isLoaded, refresh: fetchMyGames };
}
