import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { gamesApi, API_BASE } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { useAuthTokenRef } from './useAuthTokenRef';
import { getFriendlyFetchError, isAbortError } from '@/utils/apiErrors';

const DEFAULT_CITY = 'תל אביב-יפו';

const CITY_ALIASES: Record<string, string> = {
    'תל אביב': DEFAULT_CITY,
    'Tel Aviv': DEFAULT_CITY,
    'Tel Aviv-Yafo': DEFAULT_CITY,
};

function normalizeCity(city: string): string {
    return CITY_ALIASES[city] || city;
}

export function useGamesByCity(initialCity?: string) {
    const { user, isLoaded } = useUser();
    const userId = user?.id;
    const getTokenRef = useAuthTokenRef();

    const [displayedCity, setDisplayedCity] = useState(initialCity || '');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [availableCities, setAvailableCities] = useState<string[]>([]);

    const predicate = useCallback((game: Game) => {
        if (!displayedCity) return false;
        const normalizedDisplayed = normalizeCity(displayedCity);
        return normalizeCity(game.city || '') === normalizedDisplayed || game.fieldLocation?.includes(displayedCity);
    }, [displayedCity]);

    const { games, setGames } = useSyncedGames([], predicate);

    useEffect(() => {
        const controller = new AbortController();
        fetch(`${API_BASE}/api/fields/cities`, { signal: controller.signal })
            .then((res) => res.json())
            .then((data) => {
                if (!controller.signal.aborted && Array.isArray(data)) setAvailableCities(data);
            })
            .catch((err) => {
                if (!isAbortError(err)) console.error('Failed to load cities', err);
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!isLoaded || initialCity) return;

        const controller = new AbortController();

        async function fetchUserCity() {
            try {
                const token = await getTokenRef.current();
                const res = await fetch(`${API_BASE}/api/users/${userId}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    signal: controller.signal,
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!controller.signal.aborted) setDisplayedCity(normalizeCity(data.city || DEFAULT_CITY));
                }
            } catch (e) {
                if (!isAbortError(e) && !controller.signal.aborted) setDisplayedCity(DEFAULT_CITY);
            }
        }

        async function fetchTopCity() {
            try {
                const res = await fetch(`${API_BASE}/api/fields/cities/top`, { signal: controller.signal });
                const data = await res.json();
                if (!controller.signal.aborted) setDisplayedCity(normalizeCity(data.city || DEFAULT_CITY));
            } catch (e) {
                if (!isAbortError(e) && !controller.signal.aborted) setDisplayedCity(DEFAULT_CITY);
            }
        }

        if (userId) {
            fetchUserCity();
        } else {
            fetchTopCity();
        }
        return () => controller.abort();
    }, [isLoaded, userId, initialCity, getTokenRef]);

    useEffect(() => {
        if (!displayedCity) return;

        const controller = new AbortController();

        async function fetchGames() {
            setLoading(true);
            setError(null);
            try {
                const token = await getTokenRef.current({ template: undefined }).catch(() => '');
                const data = await gamesApi.getByCity(displayedCity, token || undefined, controller.signal);

                if (controller.signal.aborted) return;

                data.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                setGames(data);
            } catch (err) {
                if (isAbortError(err) || controller.signal.aborted) return;
                const message = getFriendlyFetchError(err, 'שגיאה בטעינת משחקים לפי עיר');
                if (message) setError(message);
                setGames([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        fetchGames();
        return () => controller.abort();
    }, [displayedCity, getTokenRef, setGames]);

    return { games, loading, error, displayedCity, setDisplayedCity, availableCities, isLoaded };
}
