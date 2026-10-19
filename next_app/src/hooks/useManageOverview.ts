import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { manageApi, type ManageOverview } from '@/services/api/manage';
import { useAuthTokenRef } from './useAuthTokenRef';

/** Don't refetch on tab focus more often than this. */
const FOCUS_REFETCH_MIN_MS = 15_000;

/**
 * The groups and games the signed-in user manages. Reloads when the tab regains focus, so an
 * approval or edit made elsewhere shows up without a manual refresh.
 */
export function useManageOverview() {
    const { isLoaded, isSignedIn, userId } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const [data, setData] = useState<ManageOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setData(null);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return;
                const next = await manageApi.overview(token, controller.signal);
                if (!controller.signal.aborted) {
                    setData(next);
                    setError(false);
                }
            } catch (err) {
                if (controller.signal.aborted || (err as { name?: string })?.name === 'AbortError') return;
                setError(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [isLoaded, isSignedIn, userId, getTokenRef, reloadKey]);

    // A different account must never see the previous account's data while the new one loads.
    useEffect(() => {
        setData(null);
        if (userId) setLoading(true);
    }, [userId]);

    useEffect(() => {
        if (!isSignedIn) return;
        let last = Date.now();
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - last < FOCUS_REFETCH_MIN_MS) return;
            last = Date.now();
            refetch();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [isSignedIn, refetch]);

    return { data, loading, error, refetch };
}
