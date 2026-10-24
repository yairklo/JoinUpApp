import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { useSocket } from '@/context/SocketContext';
import { toTournamentError, type TournamentApiError } from '@/services/api/tournaments';
import type { TournamentUpdateEvent, TournamentUpdateType } from '@/types/tournament';

// Shared plumbing for the tournament hooks. Not part of the public API (see ./index.ts).

/** How long the "updated just now" cue stays on (spec 0.5). */
export const UPDATED_CUE_MS = 3000;

export interface ResourceState<T> {
    data: T | null;
    loading: boolean;
    /** Typed error of the last failed load (null while ok). `error.status === 404` also covers hidden tournaments. */
    error: TournamentApiError | null;
    reload: () => Promise<void>;
}

interface ResourceOptions {
    /** false = do nothing (e.g. id not known yet). Default true. */
    enabled?: boolean;
    /** 'required' waits for a signed-in user and sends the token; 'optional' sends it when signed in. */
    auth: 'required' | 'optional';
}

/**
 * Fetch-on-mount resource with a stale-response guard. `fetcher` must be stable (useCallback) or its
 * identity change simply refetches. Never throws; failures land in `error`.
 */
export function useResource<T>(
    fetcher: (token: string | undefined) => Promise<T>,
    { enabled = true, auth }: ResourceOptions
): ResourceState<T> {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<TournamentApiError | null>(null);
    const seq = useRef(0);

    const reload = useCallback(async () => {
        if (!enabled || !isLoaded) return;
        const mine = ++seq.current;
        if (auth === 'required' && !isSignedIn) {
            setData(null);
            setLoading(false);
            return;
        }
        setError(null);
        try {
            const token = isSignedIn ? (await getTokenRef.current()) ?? undefined : undefined;
            const next = await fetcher(token);
            if (mine === seq.current) setData(next);
        } catch (e) {
            if (mine === seq.current) setError(toTournamentError(e));
        } finally {
            if (mine === seq.current) setLoading(false);
        }
        // getToken stays in a ref. Its identity changes often enough to refetch every tournament
        // query on the page and trip the read limiter (429).
    }, [enabled, isLoaded, isSignedIn, auth, fetcher]);

    useEffect(() => {
        setLoading(enabled);
        void reload();
    }, [reload, enabled]);

    return { data, loading, error, reload };
}

// ---- realtime ----

// Ref-counted room membership so two hooks on one screen (tabs) do not leave each other's room.
const roomUsers = new Map<string, number>();

export interface LiveState {
    /** true for ~3s after a refetch triggered by `tournament:update` (drives <UpdatedCue show>). */
    updated: boolean;
    /** Ids of matches changed by the last event (drives the 1.2s row flash). */
    changedMatchIds: string[];
    lastEvent: TournamentUpdateEvent | null;
}

/**
 * Join the tournament socket room and call `onUpdate` for matching `tournament:update` events.
 * `updated` turns on after `onUpdate` resolves. Does nothing without a socket / id / `enabled`.
 */
export function useTournamentLive(
    tournamentId: string | null | undefined,
    types: readonly TournamentUpdateType[] | null,
    onUpdate: (e: TournamentUpdateEvent) => Promise<void> | void,
    enabled = true
): LiveState {
    const { socket } = useSocket();
    const [state, setState] = useState<LiveState>({ updated: false, changedMatchIds: [], lastEvent: null });
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cb = useRef(onUpdate);
    cb.current = onUpdate;
    const typeKey = types ? types.join(',') : '*';

    useEffect(() => {
        if (!socket || !tournamentId || !enabled) return;
        const join = () => socket.emit('joinTournament', tournamentId);
        roomUsers.set(tournamentId, (roomUsers.get(tournamentId) ?? 0) + 1);
        join();
        // Re-join after a reconnect: rooms are lost with the old connection.
        socket.on('connect', join);

        const handler = async (e: TournamentUpdateEvent) => {
            if (!e || e.tournamentId !== tournamentId) return;
            if (types && !types.includes(e.type)) return;
            await cb.current(e);
            const ids = e.changedMatchIds?.length ? e.changedMatchIds : e.matchId ? [e.matchId] : [];
            setState({ updated: true, changedMatchIds: ids, lastEvent: e });
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setState((s) => ({ ...s, updated: false })), UPDATED_CUE_MS);
        };
        socket.on('tournament:update', handler);

        return () => {
            socket.off('tournament:update', handler);
            socket.off('connect', join);
            const left = (roomUsers.get(tournamentId) ?? 1) - 1;
            if (left <= 0) {
                roomUsers.delete(tournamentId);
                socket.emit('leaveTournament', tournamentId);
            } else {
                roomUsers.set(tournamentId, left);
            }
            if (timer.current) clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `types` is tracked through typeKey
    }, [socket, tournamentId, enabled, typeKey]);

    return state;
}

// ---- mutations ----

export interface ActionState {
    pending: boolean;
    error: TournamentApiError | null;
    /** Shortcut for error?.code. */
    errorCode: string | null;
    clearError: () => void;
}

/**
 * Wraps an authenticated mutation. `run` resolves to the result, or `undefined` on failure (never
 * throws) and stores the typed error. Each call gets a fresh token.
 */
export function useAction(): ActionState & {
    run: <T>(fn: (token: string) => Promise<T>) => Promise<T | undefined>;
} {
    const { getToken } = useAuth();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<TournamentApiError | null>(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const run = useCallback(
        async <T,>(fn: (token: string) => Promise<T>): Promise<T | undefined> => {
            setPending(true);
            setError(null);
            try {
                const token = await getToken();
                if (!token) throw new Error('Not signed in');
                return await fn(token);
            } catch (e) {
                if (mounted.current) setError(toTournamentError(e));
                return undefined;
            } finally {
                if (mounted.current) setPending(false);
            }
        },
        [getToken]
    );
    const clearError = useCallback(() => setError(null), []);
    return useMemo(
        () => ({ pending, error, errorCode: error?.code ?? null, clearError, run }),
        [pending, error, clearError, run]
    );
}
