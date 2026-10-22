import { useCallback, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { userReportsApi } from '@/services/api/results';
import { getActionErrorMessage, getErrorStatus } from '@/utils/apiError';
import type { SubmitUserReportInput } from '@/types/matchResult';

/**
 * Submit a player report. The server answers 201 for blocked pairs and duplicates too, so `sent`
 * must never be used to infer block state. `submit` resolves to true/false and never throws.
 */
export function useReportUser() {
    const { getToken } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rateLimited, setRateLimited] = useState(false);

    const submit = useCallback(
        async (input: SubmitUserReportInput): Promise<boolean> => {
            setSubmitting(true);
            setError(null);
            setRateLimited(false);
            try {
                const token = await getToken();
                if (!token) throw new Error('Not signed in');
                await userReportsApi.submit(input, token);
                setSent(true);
                return true;
            } catch (e) {
                setRateLimited(getErrorStatus(e) === 429);
                setError(getActionErrorMessage(e));
                return false;
            } finally {
                setSubmitting(false);
            }
        },
        [getToken]
    );

    const reset = useCallback(() => {
        setSent(false);
        setError(null);
        setRateLimited(false);
    }, []);

    return { submit, submitting, sent, error, rateLimited, reset };
}
