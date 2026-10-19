import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { manageApi, type ManageOverview } from '@/services/api/manage';
import { useAuthTokenRef } from './useAuthTokenRef';

/** The groups and games the signed-in user manages. */
export function useManageOverview() {
    const { isLoaded, isSignedIn } = useAuth();
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
    }, [isLoaded, isSignedIn, getTokenRef, reloadKey]);

    return { data, loading, error, refetch };
}
