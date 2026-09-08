import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi, API_BASE } from '@/services/api';
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { getLoadErrorMessage } from '@/utils/apiError';
import {
    DEFAULT_CITY,
    normalizeCity,
    expandCityAliases,
} from '@joinup/shared/cityAliases';

export { normalizeCity };

export function useGamesByCity(initialCity?: string) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    const [displayedCity, setDisplayedCity] = useState(initialCity ? normalizeCity(initialCity) : "");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
    const [availableCities, setAvailableCities] = useState<string[]>([]);

    const predicate = useCallback((game: Game) => {
        if (!displayedCity) return false;
        const normalizedDisplayed = normalizeCity(displayedCity);
        if (normalizeCity(game.city || "") === normalizedDisplayed) return true;
        if (!game.fieldLocation) return false;
        return expandCityAliases(displayedCity).some((token) => game.fieldLocation!.includes(token));
    }, [displayedCity]);

    const { games, setGames } = useSyncedGames([], predicate);

    useEffect(() => {
        fetch(`${API_BASE}/api/fields/cities`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setAvailableCities(data); })
            .catch(err => console.error("Failed to load cities", err));
    }, []);

    useEffect(() => {
        if (!isLoaded || initialCity) return;

        let ignore = false;

        async function fetchUserCity() {
            try {
                const token = await getToken();
                const res = await fetch(`${API_BASE}/api/users/${user?.id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!ignore) setDisplayedCity(normalizeCity(data.city || DEFAULT_CITY));
                } else if (!ignore) {
                    setDisplayedCity(DEFAULT_CITY);
                }
            } catch (e) {
                if (!ignore) setDisplayedCity(DEFAULT_CITY);
            }
        }

        async function fetchTopCity() {
            try {
                const res = await fetch(`${API_BASE}/api/fields/cities/top`);
                if (!res.ok) {
                    if (!ignore) setDisplayedCity(DEFAULT_CITY);
                    return;
                }
                const data = await res.json();
                if (!ignore) setDisplayedCity(normalizeCity(data.city || DEFAULT_CITY));
            } catch (e) {
                if (!ignore) setDisplayedCity(DEFAULT_CITY);
            }
        }

        if (user) {
            fetchUserCity();
        } else {
            fetchTopCity();
        }
        return () => { ignore = true; };
    }, [isLoaded, user, initialCity, getToken]);

    useEffect(() => {
        if (!displayedCity) return;
        let ignore = false;
        async function fetchGames() {
            setLoading(true);
            setError(null);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");
                const data = await gamesApi.getByCity(displayedCity, token || undefined);

                data.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) setGames(data);
            } catch (err) {
                console.error("Error loading city games:", err);
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
    }, [displayedCity, getToken, setGames, reloadKey]);

    const setDisplayedCityNormalized = useCallback((city: string) => {
        setDisplayedCity(normalizeCity(city));
    }, []);

    return { games, loading, error, refetch, displayedCity, setDisplayedCity: setDisplayedCityNormalized, availableCities, isLoaded };
}
