import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { resultsApi } from '@/services/api/results';
import type { SubmitUserReportInput } from '@/types/results';
import { USER_REPORT_DETAILS_MAX } from '@/types/results';

/**
 * Report a player's behaviour. The server answers `{ ok: true }` for any valid request (even
 * duplicates / blocked pairs), so a resolved `submit` always means "show the thanks state".
 * Errors (e.g. 429 rate limit, 400 validation) are rethrown and also kept in `error`.
 */
export function useReportUser() {
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<(Error & { status?: number }) | null>(null);

    const submit = useCallback(async (input: SubmitUserReportInput) => {
        setSubmitting(true);
        setError(null);
        try {
            const token = await getTokenRef.current();
            if (!token) throw new Error('Not signed in');
            const details = input.details?.trim().slice(0, USER_REPORT_DETAILS_MAX);
            await resultsApi.submitUserReport({ ...input, details: details || undefined }, token);
            setSubmitted(true);
        } catch (err: any) {
            setError(err);
            throw err;
        } finally {
            setSubmitting(false);
        }
    }, []);

    const reset = useCallback(() => {
        setSubmitted(false);
        setError(null);
    }, []);

    return { submit, submitting, submitted, error, reset };
}
