import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { getLoadErrorMessage } from '@/utils/apiError';

export function useGamesByDate(initialDate: string, fieldId?: string, networkGames?: boolean) {
    const { isLoaded } = useUser();
    const { getToken } = useAuth();
    const [selectedDate, setSelectedDate] = useState<string>(initialDate);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

    // Predicate for real-time updates (from useSyncedGames)
    const predicate = useCallback((game: Game) => {
        if (!game) return false;
        
        try {
            // WebSocket game:updated events often only have `start` (ISO string), while REST API results have `date` (YYYY-MM-DD).
            let gameDateStr = "";
            if (game.date) {
                gameDateStr = new Date(game.date).toISOString().split('T')[0];
            } else if (game.start) {
                gameDateStr = new Date(game.start).toISOString().split('T')[0];
            } else {
                return false;
            }
            
            const targetDate = new Date(selectedDate).toISOString().split('T')[0];
            return gameDateStr === targetDate;
        } catch (e) {
            return game.date === selectedDate;
        }
    }, [selectedDate]);

    const { games, setGames } = useSyncedGames([], predicate);

    useEffect(() => {
        let ignore = false;
        if (!isLoaded) return;

        async function fetchGames() {
            setLoading(true);
            setError(null);
            try {
                const qs = new URLSearchParams();
                qs.set("date", selectedDate);
                if (fieldId) qs.set("fieldId", fieldId);
                if (networkGames) qs.set("networkGames", "true");

                const token = await getToken({ template: undefined }).catch(() => "");

                // API call using the service
                // Note: The service handles choosing /search vs /public based on token existence logic if we pass token or undefined?
                // Actually my service implementation expected token to decide endpoint.
                // Let's pass undefined if no token.
                const data = await gamesApi.search(qs, token || undefined);

                // App-specific filtering (future games only)
                const now = new Date();
                const filtered = data.filter((g) => {
                    const start = new Date(`${g.date}T${g.time}:00`);
                    const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
                    return end >= now;
                });

                filtered.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) setGames(filtered);
            } catch (err) {
                console.error("Error loading games:", err);
                if (!ignore) {
                    setGames([]);
                    setError(getLoadErrorMessage(err));
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        fetchGames();
        return () => { ignore = true; };
    }, [selectedDate, fieldId, networkGames, isLoaded, getToken, setGames, reloadKey]);

    const groups = useMemo(() => {
        return games.reduce<Record<string, Game[]>>((acc, g) => {
            (acc[g.date] ||= []).push(g);
            return acc;
        }, {});
    }, [games]);

    return {
        selectedDate,
        setSelectedDate,
        games,
        loading,
        error,
        refetch,
        groups
    };
}
