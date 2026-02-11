import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi, API_BASE } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';

export function useGamesByFriends() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    const predicate = useCallback((game: Game) => {
        return friendIds.has(game.organizerId || "");
    }, [friendIds]);

    const { games, setGames } = useSyncedGames([], predicate);

    useEffect(() => {
        let ignore = false;
        if (!isLoaded) return;
        if (!user) {
            setLoading(false);
            return;
        }

        async function fetchGamesAndFriends() {
            setLoading(true);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");
                if (!token) return;

                // Parallel fetch: Games and Friends
                // Note: We use gamesApi for games, but we still need friend list for the predicate.
                // We might want to move friend fetching to usersApi later.
                const [gamesData, friendsRes] = await Promise.all([
                    gamesApi.getByFriends(token),
                    fetch(`${API_BASE}/api/users/${user?.id}/friends`, {
                        cache: "no-store",
                        headers: { Authorization: `Bearer ${token}` },
                    })
                ]);

                if (friendsRes.ok) {
                    const friendsData: any[] = await friendsRes.json();
                    if (!ignore) setFriendIds(new Set(friendsData.map(f => f.id)));
                }

                // Sort by date/time
                gamesData.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) setGames(gamesData);
            } catch (err) {
                console.error("Error loading friends games:", err);
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        fetchGamesAndFriends();
        return () => { ignore = true; };
    }, [isLoaded, user, getToken, setGames]);

    return { games, loading, friendIds, isLoaded };
}
