import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { gamesApi, API_BASE } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { useAuthTokenRef } from './useAuthTokenRef';
import { getFriendlyFetchError, isAbortError } from '@/utils/apiErrors';

export function useGamesByFriends() {
    const { user, isLoaded } = useUser();
    const userId = user?.id;
    const getTokenRef = useAuthTokenRef();

    const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const predicate = useCallback((game: Game) => {
        return friendIds.has(game.organizerId || '');
    }, [friendIds]);

    const { games, setGames } = useSyncedGames([], predicate);

    useEffect(() => {
        if (!isLoaded) return;
        if (!userId) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();

        async function fetchGamesAndFriends() {
            setLoading(true);
            setError(null);
            try {
                const token = await getTokenRef.current({ template: undefined }).catch(() => '');
                if (!token) return;

                const [gamesData, friendsRes] = await Promise.all([
                    gamesApi.getByFriends(token, controller.signal),
                    fetch(`${API_BASE}/api/users/${userId}/friends`, {
                        cache: 'no-store',
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    }),
                ]);

                if (controller.signal.aborted) return;

                if (friendsRes.ok) {
                    const friendsData: { id: string }[] = await friendsRes.json();
                    setFriendIds(new Set(friendsData.map((f) => f.id)));
                }

                gamesData.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                setGames(gamesData);
            } catch (err) {
                if (isAbortError(err) || controller.signal.aborted) return;
                const message = getFriendlyFetchError(err, 'שגיאה בטעינת משחקי חברים');
                if (message) setError(message);
                setGames([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        fetchGamesAndFriends();
        return () => controller.abort();
    }, [isLoaded, userId, getTokenRef, setGames]);

    return { games, loading, error, friendIds, isLoaded };
}
