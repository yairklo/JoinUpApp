import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';

export function useGamesByDate(initialDate: string, fieldId?: string) {
    const { isLoaded } = useUser();
    const { getToken } = useAuth();
    const [selectedDate, setSelectedDate] = useState<string>(initialDate);
    const [loading, setLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Predicate for real-time updates (from useSyncedGames)
    const predicate = useCallback((game: Game) => {
        const gameDate = new Date(game.date).toISOString().split('T')[0];
        const targetDate = new Date(selectedDate).toISOString().split('T')[0];
        return gameDate === targetDate;
    }, [selectedDate]);

    const { games, setGames } = useSyncedGames([], predicate);

    const refreshGames = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    useEffect(() => {
        let ignore = false;
        if (!isLoaded) {
            console.log("[useGamesByDate] User not loaded yet, skipping fetch");
            return;
        }

        async function fetchGames() {
            console.log(`[useGamesByDate] Fetching games for ${selectedDate}, refreshTrigger: ${refreshTrigger}`);
            setLoading(true);
            try {
                const qs = new URLSearchParams();
                qs.set("date", selectedDate);
                if (fieldId) qs.set("fieldId", fieldId);

                const token = await getToken({ template: undefined }).catch(() => "");
                console.log(`[useGamesByDate] Token obtained: ${token ? "YES" : "NO"}`);

                const data = await gamesApi.search(qs, token || undefined);
                console.log(`[useGamesByDate] API returned ${data?.length || 0} games`);

                // App-specific filtering (future games only)
                const now = new Date();
                const filtered = (data || []).filter((g) => {
                    try {
                        const start = new Date(`${g.date}T${g.time}:00`);
                        const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
                        return end >= now;
                    } catch (e) {
                        console.error("Invalid game date/time:", g.date, g.time);
                        return false;
                    }
                });

                filtered.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) {
                    console.log(`[useGamesByDate] Setting ${filtered.length} games to state`);
                    setGames(filtered);
                }
            } catch (err: any) {
                console.error("[useGamesByDate] API Error Details:", err);
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        fetchGames();
        return () => { ignore = true; };
    }, [selectedDate, fieldId, isLoaded, getToken, setGames, refreshTrigger]);

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
        groups,
        refreshGames
    };
}
