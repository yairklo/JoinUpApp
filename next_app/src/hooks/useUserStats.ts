import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { userStatsApi } from '@/services/api/results';
import type { UserStatsResponse } from '@/types/matchResult';
import { useAuthTokenRef } from './useAuthTokenRef';

/**
 * A user's aggregated match stats (optionally one sport). Works signed-out. `data.visible === false`
 * means privacy hides them (see `data.hiddenReason`), which is not an error.
 */
export function useUserStats(userId: string | null | undefined, sport?: string) {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const [data, setData] = useState<UserStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);

    const reload = useCallback(async () => {
        if (!userId || !isLoaded) return;
        const mine = ++seq.current;
        setLoading(true);
        setError(null);
        try {
            const token = isSignedIn ? (await getTokenRef.current()) ?? undefined : undefined;
            const next = await userStatsApi.get(userId, { sport, token });
            if (mine === seq.current) setData(next);
        } catch (e) {
            if (mine === seq.current) setError(e instanceof Error ? e.message : 'Failed to load stats');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
        // getToken is read from a ref. Clerk's function identity changes often enough to refetch
        // this effect in a loop and burn the read rate limit.
    }, [userId, sport, isLoaded, isSignedIn]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { data, loading, error, reload };
}
