import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { resultsApi } from '@/services/api/results';
import { getErrorCode } from '@/utils/apiError';
import type { GameResultView, PlayerTotalsWarning, SaveGameResultInput } from '@/types/matchResult';

/**
 * Load and mutate a game's match result. Mutations resolve to true/false (never throw) and put the
 * server error in `error` / `errorCode` (e.g. RESULT_LOCKED, GAME_NOT_FINISHED, INVALID_RESULT).
 * `save` replaces `view` with the fresh server view and exposes soft `warnings`.
 */
export function useGameResult(gameId: string | null | undefined) {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [view, setView] = useState<GameResultView | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<PlayerTotalsWarning[]>([]);
    const seq = useRef(0);

    const fail = useCallback((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Request failed');
        setErrorCode(getErrorCode(e) ?? null);
    }, []);

    const reload = useCallback(async () => {
        if (!gameId || !isLoaded) return;
        const mine = ++seq.current;
        if (!isSignedIn) {
            setView(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        setErrorCode(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('Not signed in');
            const next = await resultsApi.get(gameId, token);
            if (mine === seq.current) setView(next);
        } catch (e) {
            if (mine === seq.current) fail(e);
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [gameId, isLoaded, isSignedIn, getToken, fail]);

    useEffect(() => {
        reload();
    }, [reload]);

    const run = useCallback(
        async (fn: (token: string) => Promise<void>): Promise<boolean> => {
            setSaving(true);
            setError(null);
            setErrorCode(null);
            try {
                const token = await getToken();
                if (!token) throw new Error('Not signed in');
                await fn(token);
                return true;
            } catch (e) {
                fail(e);
                return false;
            } finally {
                setSaving(false);
            }
        },
        [getToken, fail]
    );

    const save = useCallback(
        (input: SaveGameResultInput) =>
            run(async (token) => {
                const { warnings: w, savedAt, ...fresh } = await resultsApi.save(gameId as string, input, token);
                void savedAt;
                setView(fresh);
                setWarnings(w ?? []);
            }),
        [run, gameId]
    );

    const remove = useCallback(
        () =>
            run(async (token) => {
                await resultsApi.remove(gameId as string, token);
                setWarnings([]);
                setView((prev) => (prev ? { ...prev, result: null, locked: false } : prev));
            }),
        [run, gameId]
    );

    const dispute = useCallback(
        (details?: string) =>
            run(async (token) => {
                await resultsApi.dispute(gameId as string, { details }, token);
            }),
        [run, gameId]
    );

    return { view, loading, saving, error, errorCode, warnings, reload, save, remove, dispute };
}
