import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';

export function useGamesByDate(initialDate: string, fieldId?: string) {
    const { isLoaded } = useUser();
    const { getToken } = useAuth();
    const [selectedDate, setSelectedDate] = useState<string>(initialDate);
    const [loading, setLoading] = useState(false);

    // Predicate for real-time updates (from useSyncedGames)
    const predicate = useCallback((game: Game) => {
        const gameDate = new Date(game.date).toISOString().split('T')[0];
        const targetDate = new Date(selectedDate).toISOString().split('T')[0];
        return gameDate === targetDate;
    }, [selectedDate]);

    const { games, setGames } = useSyncedGames([], predicate);

    useEffect(() => {
        let ignore = false;
        if (!isLoaded) return;

        async function fetchGames() {
            setLoading(true);
            try {
                const qs = new URLSearchParams();
                qs.set("date", selectedDate);
                if (fieldId) qs.set("fieldId", fieldId);

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
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        fetchGames();
        return () => { ignore = true; };
    }, [selectedDate, fieldId, isLoaded, getToken, setGames]);

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
        groups
    };
}
