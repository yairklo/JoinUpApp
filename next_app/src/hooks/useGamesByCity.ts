import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi, API_BASE } from '@/services/api'; // user city still needs manual fetch
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';
import { getLoadErrorMessage } from '@/utils/apiError';

const DEFAULT_CITY = "תל אביב-יפו";

const CITY_ALIASES: Record<string, string> = {
    "תל אביב": DEFAULT_CITY,
    "Tel Aviv": DEFAULT_CITY,
    "Tel Aviv-Yafo": DEFAULT_CITY,
};

const ALL_CITY_TOKENS = [DEFAULT_CITY, ...Object.keys(CITY_ALIASES)];

export function normalizeCity(city: string): string {
    return CITY_ALIASES[city] || city;
}

export function useGamesByCity(initialCity?: string) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    const [displayedCity, setDisplayedCity] = useState(initialCity || "");
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
        return ALL_CITY_TOKENS.some(
            (token) => normalizeCity(token) === normalizedDisplayed && game.fieldLocation!.includes(token)
        );
    }, [displayedCity]);

    const { games, setGames } = useSyncedGames([], predicate);

    // Fetch cities list
    useEffect(() => {
        fetch(`${API_BASE}/api/fields/cities`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setAvailableCities(data); })
            .catch(err => console.error("Failed to load cities", err));
    }, []);

    // Fetch User City (authenticated) or the most active city (guest)
    useEffect(() => {
        if (!isLoaded || initialCity) return;

        let ignore = false;

        async function fetchUserCity() {
            try {
                const token = await getToken();
                // We don't have a specialized User API for 'get full user object' yet in users.ts,
                // only 'getProfile'. Let's assume we can add it or just fetch here responsibly.
                // For speed, I'll fetch here, but ideally this goes to usersApi.
                const res = await fetch(`${API_BASE}/api/users/${user?.id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!ignore) setDisplayedCity(normalizeCity(data.city || DEFAULT_CITY));
                }
            } catch (e) {
                if (!ignore) setDisplayedCity(DEFAULT_CITY);
            }
        }

        async function fetchTopCity() {
            try {
                const res = await fetch(`${API_BASE}/api/fields/cities/top`);
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

    // Fetch Games
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
