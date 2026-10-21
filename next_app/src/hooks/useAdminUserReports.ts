import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { adminUserReportsApi } from '@/services/api/results';
import { getErrorStatus } from '@/utils/apiError';
import type { AdminUserReport, UserReportResolveAction, UserReportStatus } from '@/types/matchResult';

/** Pure: drop a closed report from the currently listed set. */
export function withoutReport(reports: AdminUserReport[], id: string): AdminUserReport[] {
    return reports.filter((r) => r.id !== id);
}

/**
 * Admin queue of player reports for one status. resolve/dismiss remove the row from the list on
 * success (and on 409 "already closed", since someone else closed it) and resolve to true/false
 * without throwing. Callers must be admins (gate with useIsAdmin).
 */
export function useAdminUserReports(status: UserReportStatus = 'OPEN') {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [reports, setReports] = useState<AdminUserReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const seq = useRef(0);

    const reload = useCallback(async () => {
        if (!isLoaded) return;
        const mine = ++seq.current;
        if (!isSignedIn) {
            setReports([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('Not signed in');
            const rows = await adminUserReportsApi.list(status, token);
            if (mine === seq.current) setReports(rows);
        } catch (e) {
            if (mine === seq.current) setError(e instanceof Error ? e.message : 'Failed to load reports');
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [status, isLoaded, isSignedIn, getToken]);

    useEffect(() => {
        reload();
    }, [reload]);

    const close = useCallback(
        async (id: string, call: (token: string) => Promise<unknown>): Promise<boolean> => {
            setBusyId(id);
            setError(null);
            try {
                const token = await getToken();
                if (!token) throw new Error('Not signed in');
                await call(token);
                setReports((prev) => withoutReport(prev, id));
                return true;
            } catch (e) {
                if (getErrorStatus(e) === 409) setReports((prev) => withoutReport(prev, id));
                setError(e instanceof Error ? e.message : 'Action failed');
                return false;
            } finally {
                setBusyId(null);
            }
        },
        [getToken]
    );

    const resolve = useCallback(
        (id: string, resolution: string, action: UserReportResolveAction = 'NONE') =>
            close(id, (token) => adminUserReportsApi.resolve(id, { resolution, action }, token)),
        [close]
    );

    const dismiss = useCallback((id: string) => close(id, (token) => adminUserReportsApi.dismiss(id, token)), [close]);

    return { reports, loading, error, busyId, reload, resolve, dismiss };
}
