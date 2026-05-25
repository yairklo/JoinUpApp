import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { gamesApi, API_BASE } from '@/services/api'; // user city still needs manual fetch
import { Game } from '@/types/game';
import { useSyncedGames } from './useSyncedGames';

export function useGamesByCity(initialCity?: string) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    const [displayedCity, setDisplayedCity] = useState(initialCity || "");
    const [loading, setLoading] = useState(true);
    const [availableCities, setAvailableCities] = useState<string[]>([]);

    const predicate = useCallback((game: Game) => {
        if (!displayedCity) return false;
        return game.city === displayedCity || game.fieldLocation?.includes(displayedCity);
    }, [displayedCity]);

    const { games, setGames } = useSyncedGames([], predicate);

    // Fetch cities list
    useEffect(() => {
        fetch(`${API_BASE}/api/fields/cities`)
            .then(res => res.json())
            .then(data => { if (Array.isArray(data)) setAvailableCities(data); })
            .catch(err => console.error("Failed to load cities", err));
    }, []);

    // Fetch User City
    useEffect(() => {
        if (!isLoaded || initialCity) return;
        if (!user) return;

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
                    if (!ignore) setDisplayedCity(data.city || "Tel Aviv");
                }
            } catch (e) {
                if (!ignore) setDisplayedCity("Tel Aviv");
            }
        }
        fetchUserCity();
        return () => { ignore = true; };
    }, [isLoaded, user, initialCity, getToken]);

    // Fetch Games
    useEffect(() => {
        if (!displayedCity) return;
        let ignore = false;
        async function fetchGames() {
            setLoading(true);
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
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }
        fetchGames();
        return () => { ignore = true; };
    }, [displayedCity, getToken, setGames]);

    return { games, loading, displayedCity, setDisplayedCity, availableCities, isLoaded };
}
