import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { manageApi, type ManageOverview } from '@/services/api/manage';
import { isAbortError } from '@/utils/apiErrors';

/** The groups and games the signed-in user manages. Reloads whenever the screen regains focus. */
export function useManageOverview() {
    const { isSignedIn, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;
    const [data, setData] = useState<ManageOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async (signal?: AbortSignal) => {
        if (!isSignedIn) {
            setData(null);
            setLoading(false);
            return;
        }
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const next = await manageApi.overview(token, signal);
            if (!signal?.aborted) {
                setData(next);
                setError(false);
            }
        } catch (err) {
            if (isAbortError(err) || signal?.aborted) return;
            setError(true);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [isSignedIn]);

    useFocusEffect(useCallback(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]));

    const refresh = useCallback(() => load(), [load]);

    return { data, loading, error, refresh };
}
