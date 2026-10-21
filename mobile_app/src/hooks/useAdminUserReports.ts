import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { resultsApi } from '@/services/api/results';
import { isAbortError } from '@/utils/apiErrors';
import type { AdminUserReport, UserReportStatus } from '@/types/results';

/**
 * Admin queue of player reports (server caps at 100, newest first). Resolve/dismiss remove the
 * row locally on success; a 409 ("already closed", e.g. by another admin) also drops the row and
 * is rethrown so the UI can say so. Admin-only: the server returns 403 for non-admins.
 */
export function useAdminUserReports(status: UserReportStatus = 'OPEN') {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const [reports, setReports] = useState<AdminUserReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async (signal?: AbortSignal) => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setReports([]);
            setLoading(false);
            return;
        }
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const rows = await resultsApi.adminListUserReports(status, token, signal);
            if (signal?.aborted) return;
            setReports(rows);
            setError(false);
        } catch (err) {
            if (isAbortError(err) || signal?.aborted) return;
            setError(true);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [status, isLoaded, isSignedIn]);

    useEffect(() => {
        setLoading(true);
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const close = useCallback(async (id: string, run: (token: string) => Promise<unknown>) => {
        setBusyId(id);
        try {
            const token = await getTokenRef.current();
            if (!token) throw new Error('Not signed in');
            await run(token);
            setReports((prev) => prev.filter((r) => r.id !== id));
        } catch (err: any) {
            if (err?.status === 409) setReports((prev) => prev.filter((r) => r.id !== id));
            throw err;
        } finally {
            setBusyId(null);
        }
    }, []);

    /** `action: 'BAN'` also bans the reported account (server refuses banning yourself). */
    const resolve = useCallback(
        (id: string, resolution: string, action: 'NONE' | 'BAN' = 'NONE') =>
            close(id, (token) => resultsApi.adminResolveUserReport(id, { resolution: resolution.trim(), action }, token)),
        [close]
    );

    const dismiss = useCallback(
        (id: string) => close(id, (token) => resultsApi.adminDismissUserReport(id, token)),
        [close]
    );

    const refresh = useCallback(() => load(), [load]);

    return { reports, loading, error, busyId, resolve, dismiss, refresh };
}
