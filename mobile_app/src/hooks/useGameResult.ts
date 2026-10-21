import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { resultsApi } from '@/services/api/results';
import { isAbortError } from '@/utils/apiErrors';
import type { GameResultView, SaveGameResultInput, SaveGameResultResponse, GameResultWarning } from '@/types/results';

/**
 * A game's recorded result plus the viewer's permissions. Works signed-out (public games).
 * Mutations rethrow apiClient errors (`err.code` / `err.status`, see GameResultErrorCode) so the
 * UI can map them to messages; `saving`/`deleting`/`disputing` flags are exposed for buttons.
 */
export function useGameResult(gameId: string | undefined) {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const [data, setData] = useState<GameResultView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<(Error & { status?: number; code?: string }) | null>(null);
    const [warnings, setWarnings] = useState<GameResultWarning[]>([]);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [disputing, setDisputing] = useState(false);

    const load = useCallback(async (signal?: AbortSignal) => {
        if (!gameId || !isLoaded) return;
        try {
            const token = isSignedIn ? (await getTokenRef.current()) ?? undefined : undefined;
            const next = await resultsApi.getGameResult(gameId, token, signal);
            if (signal?.aborted) return;
            setData(next);
            setError(null);
        } catch (err: any) {
            if (isAbortError(err) || signal?.aborted) return;
            setError(err);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [gameId, isLoaded, isSignedIn]);

    useEffect(() => {
        setLoading(true);
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const requireToken = async () => {
        const token = await getTokenRef.current();
        if (!token) throw new Error('Not signed in');
        return token;
    };

    const save = useCallback(async (input: SaveGameResultInput): Promise<SaveGameResultResponse> => {
        if (!gameId) throw new Error('Missing gameId');
        setSaving(true);
        try {
            const res = await resultsApi.saveGameResult(gameId, input, await requireToken());
            const { warnings: w, savedAt: _savedAt, ...view } = res;
            setData(view);
            setWarnings(w ?? []);
            setError(null);
            return res;
        } finally {
            setSaving(false);
        }
    }, [gameId]);

    const remove = useCallback(async () => {
        if (!gameId) throw new Error('Missing gameId');
        setDeleting(true);
        try {
            await resultsApi.deleteGameResult(gameId, await requireToken());
            setWarnings([]);
            await load();
        } finally {
            setDeleting(false);
        }
    }, [gameId, load]);

    const dispute = useCallback(async (details?: string) => {
        if (!gameId) throw new Error('Missing gameId');
        setDisputing(true);
        try {
            await resultsApi.disputeGameResult(gameId, { details: details?.trim() || undefined }, await requireToken());
        } finally {
            setDisputing(false);
        }
    }, [gameId]);

    const refresh = useCallback(() => load(), [load]);

    return { data, loading, error, warnings, saving, deleting, disputing, save, remove, dispute, refresh };
}
