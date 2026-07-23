import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useSocket } from '@/context/SocketContext';
import { usersApi, NotificationCounters } from '@/services/api';
import { useAuthTokenRef } from './useAuthTokenRef';

const EMPTY_COUNTERS: NotificationCounters = { friendRequests: 0, unreadMessages: 0 };
const FALLBACK_POLL_MS = 60_000;

export function useNotificationCounters() {
    const { userId, isLoaded } = useAuth();
    const { socket, isConnected } = useSocket();
    const getTokenRef = useAuthTokenRef();
    const [counters, setCounters] = useState<NotificationCounters>(EMPTY_COUNTERS);

    const fetchInFlightRef = useRef(false);

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

    // Initial fetch on mount / auth state load
    useEffect(() => {
        if (isLoaded && userId) {
            fetchCountersRef.current();
        } else if (isLoaded && !userId) {
            setCounters(EMPTY_COUNTERS);
        }
    }, [isLoaded, userId]);

    // Tab visibility listener: triggers fetch when returning to visible
    useEffect(() => {
        if (!userId) return;

        const onVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                fetchCountersRef.current();
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', onVisibilityChange);
        }

        return () => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', onVisibilityChange);
            }
        };
    }, [userId]);

    // Fallback Polling — Active ONLY when Socket is disconnected
    useEffect(() => {
        if (!isLoaded || !userId || isConnected) return;

        const pollInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            fetchCountersRef.current();
        }, FALLBACK_POLL_MS);

        return () => {
            clearInterval(pollInterval);
        };
    }, [isLoaded, userId, isConnected]);

    // Socket-driven updates
    useEffect(() => {
        if (!userId || !socket) return;

        const onConnect = () => fetchCountersRef.current();
        const handleCountersUpdated = (data: NotificationCounters) => {
            setCounters(data);
        };

        if (isConnected) onConnect();

        socket.on('connect', onConnect);
        socket.on('countersUpdated', handleCountersUpdated);

        return () => {
            socket.off('connect', onConnect);
            socket.off('countersUpdated', handleCountersUpdated);
        };
    }, [userId, socket, isConnected]);

    const refreshCounters = useCallback(
        () => fetchCounters(),
        [fetchCounters]
    );

    return { ...counters, refreshCounters };
}

