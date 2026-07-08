import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useSocket } from '@/context/SocketContext';
import { usersApi, NotificationCounters } from '@/services/api';

const EMPTY_COUNTERS: NotificationCounters = { friendRequests: 0, unreadMessages: 0 };

// Drives the live Navbar badges (pending friend requests + unread chat messages).
// Fetches the aggregated snapshot once on mount/reconnect, then stays in sync via the
// server-pushed 'countersUpdated' socket event — no client-side incrementing, so the
// badge can never drift out of sync with the database.
export function useNotificationCounters() {
    const { userId, isLoaded, getToken } = useAuth();
    const { socket, isConnected } = useSocket();
    const [counters, setCounters] = useState<NotificationCounters>(EMPTY_COUNTERS);

    const fetchCounters = useCallback(async () => {
        if (!userId) return;
        try {
            const token = await getToken();
            if (!token) return;
            const data = await usersApi.getNotificationCounters(token);
            setCounters(data);
        } catch (error) {
            console.error('[COUNTERS] Failed to fetch notification counters:', error);
        }
    }, [userId, getToken]);

    useEffect(() => {
        if (!isLoaded || !userId) {
            setCounters(EMPTY_COUNTERS);
            return;
        }
        fetchCounters();
    }, [isLoaded, userId, fetchCounters]);

    useEffect(() => {
        if (!userId || !socket || !isConnected) return;

        // Re-sync on every (re)connect, in case counts changed while disconnected
        fetchCounters();

        const handleCountersUpdated = (data: NotificationCounters) => setCounters(data);
        socket.on('countersUpdated', handleCountersUpdated);

        return () => {
            socket.off('countersUpdated', handleCountersUpdated);
        };
    }, [userId, socket, isConnected, fetchCounters]);

    return { ...counters, refreshCounters: fetchCounters };
}
