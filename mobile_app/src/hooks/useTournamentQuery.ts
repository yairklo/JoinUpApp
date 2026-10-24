import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { SocketManager } from '@/services/socketManager';
import { isAbortError, getTokenOrThrow } from '@/utils/apiErrors';
import type { TournamentUpdateEvent, TournamentUpdateType } from '@/types/tournament';

export type ApiError = Error & { status?: number; code?: string; body?: any };

/** How long the "Updated just now" cue (UpdatedCue) stays up after a realtime event (spec 0.5). */
export const UPDATED_CUE_MS = 3000;
/** How long changed rows flash (spec 0.5). */
export const CHANGED_FLASH_MS = 1200;

export interface TournamentLive {
    /** True for 3s after the last `tournament:update` (restarts on each event). Feed `UpdatedCue visible`. */
    updated: boolean;
    /** Match ids that changed in the last event, cleared after 1.2s. Feed the row/card flash. */
    changedMatchIds: string[];
    /** Last event received (null until one arrives). */
    lastEvent: TournamentUpdateEvent | null;
}

/**
 * Joins the tournament socket room (`joinTournament`, re-joined on reconnect) and calls `onUpdate`
 * for every `tournament:update` of that tournament whose `type` is in `types` (default: all).
 * Returns the cue state. Safe signed-out (the emit is skipped while the socket is down).
 */
export function useTournamentLive(
    tournamentId: string | undefined,
    onUpdate: (event: TournamentUpdateEvent) => void,
    types?: TournamentUpdateType[]
): TournamentLive {
    const [live, setLive] = useState<TournamentLive>({ updated: false, changedMatchIds: [], lastEvent: null });
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const typesKey = types ? types.join(',') : '*';
    const cueTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (!tournamentId) return;
        const join = () => SocketManager.emit('joinTournament', tournamentId);
        join();
        const offConnect = SocketManager.on('connect', join);
        const offUpdate = SocketManager.on('tournament:update', (event: TournamentUpdateEvent) => {
            if (!event || event.tournamentId !== tournamentId) return;
            if (typesKey !== '*' && !typesKey.split(',').includes(event.type)) return;
            onUpdateRef.current(event);
            const changed = [...(event.changedMatchIds ?? []), ...(event.matchId ? [event.matchId] : [])];
            setLive({ updated: true, changedMatchIds: [...new Set(changed)], lastEvent: event });
            if (cueTimer.current) clearTimeout(cueTimer.current);
            cueTimer.current = setTimeout(() => setLive((p) => ({ ...p, updated: false })), UPDATED_CUE_MS);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setLive((p) => ({ ...p, changedMatchIds: [] })), CHANGED_FLASH_MS);
        });
        return () => {
            offConnect();
            offUpdate();
            if (cueTimer.current) clearTimeout(cueTimer.current);
            if (flashTimer.current) clearTimeout(flashTimer.current);
        };
    }, [tournamentId, typesKey]);

    return live;
}

interface QueryOptions {
    /** Skip fetching (and reset to idle) while false. */
    enabled?: boolean;
    /** Signed-out viewers cannot call this endpoint: stay idle instead of a 401. */
    requireAuth?: boolean;
}

export interface TournamentQuery<T> {
    data: T | null;
    /** True only until the first result for the current key; background refetches do not set it. */
    loading: boolean;
    error: ApiError | null;
    /** `error.status === 404` (hidden draft / private tournament / unknown id). */
    notFound: boolean;
    refetch: () => Promise<void>;
}

/**
 * Internal data loader shared by the tournament hooks: auth-aware (token optional unless
 * `requireAuth`), abort-safe, keeps previous data on refetch errors. `key` identifies the request;
 * changing it resets to loading.
 */
export function useTournamentQuery<T>(
    key: string,
    fetcher: (token: string | undefined, signal: AbortSignal) => Promise<T>,
    { enabled = true, requireAuth = false }: QueryOptions = {}
): TournamentQuery<T> {
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<ApiError | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const keyRef = useRef(key);

    const active = enabled && isLoaded && (!requireAuth || !!isSignedIn);

    const load = useCallback(async () => {
        if (!active) return;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            const token = isSignedIn ? (await getTokenRef.current()) ?? undefined : undefined;
            const next = await fetcherRef.current(token, controller.signal);
            if (controller.signal.aborted) return;
            setData(next);
            setError(null);
        } catch (err: any) {
            if (isAbortError(err) || controller.signal.aborted) return;
            setError(err);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [active, isSignedIn]);

    useEffect(() => {
        if (keyRef.current !== key) {
            keyRef.current = key;
            setData(null);
            setError(null);
        }
        if (!active) {
            // Auth still loading counts as loading; a settled "not allowed" state is idle.
            setLoading(enabled && !isLoaded);
            return;
        }
        setLoading(true);
        void load();
        return () => controllerRef.current?.abort();
    }, [key, active, enabled, isLoaded, load]);

    return { data, loading, error, notFound: error?.status === 404, refetch: load };
}

export interface MutationState {
    /** True while a mutation of this hook is in flight. */
    pending: boolean;
}

/**
 * Internal mutation runner: resolves a fresh Clerk token, tracks `pending`, rethrows apiClient
 * errors untouched (`err.code`, `err.status`, `err.body`) so the UI maps them with tournamentErrors.
 */
export function useTournamentMutationRunner() {
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;
    const [pending, setPending] = useState(false);
    const inflight = useRef(0);

    const run = useCallback(async <R,>(fn: (token: string) => Promise<R>): Promise<R> => {
        inflight.current += 1;
        setPending(true);
        try {
            return await fn(await getTokenOrThrow(() => getTokenRef.current()));
        } finally {
            inflight.current -= 1;
            if (inflight.current === 0) setPending(false);
        }
    }, []);

    return { run, pending };
}
