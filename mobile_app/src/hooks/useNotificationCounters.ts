import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { SocketManager } from '@/services/socketManager';
import { usersApi, NotificationCounters } from '@/services/api';
import { useAuthTokenRef } from './useAuthTokenRef';

const EMPTY_COUNTERS: NotificationCounters = { friendRequests: 0, unreadMessages: 0 };
const FALLBACK_POLL_MS = 60_000;

export function useNotificationCounters() {
    const { userId, isLoaded } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const [counters, setCounters] = useState<NotificationCounters>(EMPTY_COUNTERS);
    const [isSocketConnected, setIsSocketConnected] = useState(SocketManager.connected);

    const fetchInFlightRef = useRef(false);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const fetchCounters = useCallback(async () => {
        if (!userId) return;
        if (fetchInFlightRef.current) return;

        fetchInFlightRef.current = true;
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const data = await usersApi.getNotificationCounters(token);
            setCounters(data);
        } catch (error) {
            console.error('[COUNTERS] Failed to fetch notification counters:', error);
        } finally {
            fetchInFlightRef.current = false;
        }
    }, [userId, getTokenRef]);

    const fetchCountersRef = useRef(fetchCounters);
    useEffect(() => {
        fetchCountersRef.current = fetchCounters;
    }, [fetchCounters]);

    // Track Socket Connection Status
    useEffect(() => {
        if (!isLoaded || !userId) {
            setIsSocketConnected(false);
            return;
        }

        setIsSocketConnected(SocketManager.connected);

        const handleConnect = () => setIsSocketConnected(true);
        const handleDisconnect = () => setIsSocketConnected(false);

        const unsubConnect = SocketManager.on('connect', handleConnect);
        const unsubDisconnect = SocketManager.on('disconnect', handleDisconnect);
        const unsubConnectError = SocketManager.on('connect_error', handleDisconnect);

        return () => {
            unsubConnect();
            unsubDisconnect();
            unsubConnectError();
        };
    }, [isLoaded, userId]);

    // AppState listener: triggers immediate fetch on foregrounding
    useEffect(() => {
        if (!userId) return;

        const handleAppStateChange = (nextStatus: AppStateStatus) => {
            if (appStateRef.current !== 'active' && nextStatus === 'active') {
                fetchCountersRef.current();
            }
            appStateRef.current = nextStatus;
        };

        const sub = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            sub.remove();
        };
    }, [userId]);

    // Initial fetch + socket listeners
    useEffect(() => {
        if (!isLoaded || !userId) {
            setCounters(EMPTY_COUNTERS);
            return;
        }

        fetchCountersRef.current();

        const onConnect = () => fetchCountersRef.current();
        const unsubscribeConnect = SocketManager.on('connect', onConnect);

        const unsubscribeCounters = SocketManager.on('countersUpdated', (data: NotificationCounters) => {
            setCounters(data);
        });

        return () => {
            unsubscribeConnect();
            unsubscribeCounters();
        };
    }, [isLoaded, userId]);

    // Fallback Polling — Active ONLY when Socket is disconnected
    useEffect(() => {
        if (!isLoaded || !userId || isSocketConnected) return;

        const pollInterval = setInterval(() => {
            if (appStateRef.current !== 'active') return;
            fetchCountersRef.current();
        }, FALLBACK_POLL_MS);

        return () => {
            clearInterval(pollInterval);
        };
    }, [isLoaded, userId, isSocketConnected]);

    const refreshCounters = useCallback(
        () => fetchCounters(),
        [fetchCounters]
    );

    return { ...counters, refreshCounters };
}

