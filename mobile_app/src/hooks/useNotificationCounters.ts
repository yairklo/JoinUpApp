import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { SocketManager } from '@/services/socketManager';
import { usersApi, NotificationCounters } from '@/services/api';

const EMPTY_COUNTERS: NotificationCounters = { friendRequests: 0, unreadMessages: 0 };

// Drives the live Navbar/Tab badges (pending friend requests + unread chat messages).
// Fetches the aggregated snapshot once on mount/reconnect, then stays in sync via the
// server-pushed 'countersUpdated' socket event — no client-side incrementing, so the
// badge can never drift out of sync with the database.
export function useNotificationCounters() {
    const { userId, isLoaded, getToken } = useAuth();
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
        const unsubscribeConnect = SocketManager.on('connect', fetchCounters);
        return () => unsubscribeConnect();
    }, [isLoaded, userId, fetchCounters]);

    useEffect(() => {
        if (!userId) return;
        const unsubscribe = SocketManager.on('countersUpdated', (data: NotificationCounters) => {
            setCounters(data);
        });
        return () => unsubscribe();
    }, [userId]);

    return { ...counters, refreshCounters: fetchCounters };
}
