import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { getJerusalemDayRangeUTC } from '@/utils/timezone';

export function useGamesByDate(initialDate: string, fieldId?: string, networkGames?: boolean) {
    const { isLoaded } = useUser();
    const { getToken } = useAuth();
    const [selectedDate, setSelectedDate] = useState<string>(initialDate);
    const [loading, setLoading] = useState(false);

    // Predicate for real-time updates (from useSyncedGames)
    const predicate = useCallback((game: Game) => {
        const gameDate = new Date(game.start).toISOString().split('T')[0];
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
                const { startDate, endDate } = getJerusalemDayRangeUTC(selectedDate);
                const qs = new URLSearchParams();
                qs.set("startDate", startDate);
                qs.set("endDate", endDate);
                if (fieldId) qs.set("fieldId", fieldId);
                if (networkGames) qs.set("networkGames", "true");

                const token = await getToken({ template: undefined }).catch(() => "");

                const data = await gamesApi.search(qs, token || undefined);

                // App-specific filtering (future games only)
                const now = new Date();
                const filtered = data.filter((g) => {
                    const start = new Date(g.start);
                    const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
                    return end >= now;
                });

                filtered.sort(
                    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
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
    }, [selectedDate, fieldId, networkGames, isLoaded, getToken, setGames]);

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
