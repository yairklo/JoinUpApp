import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { gamesApi } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { useDebouncedValue } from './useDebouncedValue';
import { useAuthTokenRef } from './useAuthTokenRef';
import { getFriendlyFetchError, isAbortError } from '@/utils/apiErrors';

const DATE_DEBOUNCE_MS = 300;

function filterFutureGames(data: Game[]): Game[] {
    const now = new Date();
    const filtered = (data || []).filter((g) => {
        try {
            const start = new Date(`${g.date}T${g.time}:00`);
            const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
            return end >= now;
        } catch {
            return false;
        }
    });

    filtered.sort(
        (a, b) =>
            new Date(`${a.date}T${a.time}:00`).getTime() -
            new Date(`${b.date}T${b.time}:00`).getTime()
    );

    return filtered;
}

export function useGamesByDate(initialDate: string, fieldId?: string) {
    const { isLoaded } = useUser();
    const getTokenRef = useAuthTokenRef();

    const [selectedDate, setSelectedDate] = useState<string>(initialDate);
    const debouncedDate = useDebouncedValue(selectedDate, DATE_DEBOUNCE_MS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchGenerationRef = useRef(0);
    const fieldIdRef = useRef(fieldId);
    useEffect(() => {
        fieldIdRef.current = fieldId;
    }, [fieldId]);

    const predicate = useCallback((game: Game) => {
        if (!game) return false;

        try {
            let gameDateStr = '';
            if (game.date) {
                gameDateStr = new Date(game.date).toISOString().split('T')[0];
            } else if (game.start) {
                gameDateStr = new Date(game.start).toISOString().split('T')[0];
            } else {
                return false;
            }

            const targetDate = new Date(debouncedDate).toISOString().split('T')[0];
            return gameDateStr === targetDate;
        } catch {
            return game.date === debouncedDate;
        }
    }, [debouncedDate]);

    const { games, setGames } = useSyncedGames([], predicate);

    const runFetch = useCallback(
        async (date: string, signal: AbortSignal, generation: number) => {
            setLoading(true);
            setError(null);

            try {
                const qs = new URLSearchParams();
                qs.set('date', date);
                if (fieldIdRef.current) qs.set('fieldId', fieldIdRef.current);

                const token = await getTokenRef.current({ template: undefined }).catch(() => '');
                const data = await gamesApi.search(qs, token || undefined, signal);

                if (signal.aborted || generation !== fetchGenerationRef.current) return;

                setGames(filterFutureGames(data));
            } catch (err: unknown) {
                if (signal.aborted || isAbortError(err)) return;
                if (generation !== fetchGenerationRef.current) return;

                const message = getFriendlyFetchError(err, 'שגיאה בטעינת משחקים');
                if (message) setError(message);
            } finally {
                if (!signal.aborted && generation === fetchGenerationRef.current) {
                    setLoading(false);
                }
            }
        },
        [getTokenRef, setGames]
    );

    useEffect(() => {
        if (!isLoaded) return;

        const generation = ++fetchGenerationRef.current;
        const controller = new AbortController();

        runFetch(debouncedDate, controller.signal, generation);

        return () => {
            controller.abort();
        };
    }, [debouncedDate, isLoaded, runFetch]);

    const refreshGames = useCallback(async () => {
        if (!isLoaded) return;

        const generation = ++fetchGenerationRef.current;
        const controller = new AbortController();
        await runFetch(debouncedDate, controller.signal, generation);
    }, [debouncedDate, isLoaded, runFetch]);

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
        groups,
        refreshGames,
    };
}
