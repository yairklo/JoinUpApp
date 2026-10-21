import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { resultsApi } from '@/services/api/results';
import { isAbortError } from '@/utils/apiErrors';
import type { UserStatsResponse } from '@/types/results';

/**
 * Aggregated match stats for a profile. When the owner hid them (or privacy blocks the viewer)
 * the server answers `{ visible: false, hiddenReason, sports: [] }` rather than an error.
 * `sport` (e.g. 'SOCCER') optionally narrows the response to one sport.
 */
export function useUserStats(userId: string | undefined, sport?: string) {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const [data, setData] = useState<UserStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async (signal?: AbortSignal) => {
        if (!userId || !isLoaded) return;
        try {
            const token = isSignedIn ? (await getTokenRef.current()) ?? undefined : undefined;
            const next = await resultsApi.getUserStats(userId, sport, token, signal);
            if (signal?.aborted) return;
            setData(next);
            setError(false);
        } catch (err) {
            if (isAbortError(err) || signal?.aborted) return;
            setError(true);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [userId, sport, isLoaded, isSignedIn]);

    useEffect(() => {
        setLoading(true);
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const refresh = useCallback(() => load(), [load]);

    return { data, loading, error, refresh };
}
