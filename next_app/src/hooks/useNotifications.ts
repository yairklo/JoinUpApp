import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useSocket } from '@/context/SocketContext';
import { notificationsApi, Notification as NotificationType } from '@/services/api';

const CHAT_NOTIFICATION_TYPES = new Set(['message', 'NEW_MESSAGE', 'CHAT_MESSAGE', 'chat_message']);

function isChatNotification(data: { type?: string; roomId?: string; data?: Record<string, unknown> }): boolean {
    const type = String(data.type || '').trim();
    const typeUpper = type.toUpperCase();
    if (CHAT_NOTIFICATION_TYPES.has(type) || typeUpper === 'NEW_MESSAGE' || typeUpper === 'MESSAGE') {
        return true;
    }
    return !!(data.roomId || data.data?.chatId || data.data?.roomId);
}

function filterFeedNotifications(items: NotificationType[]): NotificationType[] {
    return items.filter((n) => !isChatNotification({ type: n.type, data: n.data }));
}

export function useNotifications() {
    const { userId, isLoaded, getToken } = useAuth();

    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const { socket, isConnected } = useSocket();
    const getTokenRef = useRef(getToken);

    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    const fetchNotifications = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const data = await notificationsApi.getAll(token);
            setNotifications(filterFeedNotifications(data.notifications || []));
            setUnreadCount(data.unreadCount || 0);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to fetch:', error);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!isLoaded || !userId) return;
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, userId]);

    useEffect(() => {
        if (!userId || !socket || !isConnected) return;

        socket.emit('join', `user_${userId}`);

        const handleNotification = (data: NotificationType & { roomId?: string }) => {
            if (isChatNotification(data)) return;

            setNotifications((prev) => {
                if (data.id && prev.some((n) => n.id === data.id)) return prev;
                return [data, ...prev];
            });
            setUnreadCount((prev) => prev + 1);

            if (typeof window !== 'undefined' && Notification.permission === 'granted') {
                new Notification(data.title, {
                    body: data.body,
                    icon: '/icon-192x192.png',
                });
            }
        };

        socket.on('notification', handleNotification);
        return () => {
            socket.off('notification', handleNotification);
        };
    }, [userId, socket, isConnected]);

    const markAsRead = async (id: string) => {
        // Snapshot so we can roll back if the API call fails — otherwise a 429/500
        // leaves the UI optimistically claiming the notification was read when it wasn't.
        let previousNotifications: NotificationType[] = [];
        let previousUnreadCount = 0;
        try {
            const token = await getTokenRef.current();
            if (!token) return;

            setNotifications((prev) => {
                previousNotifications = prev;
                return prev.map((n) => (n.id === id ? { ...n, read: true } : n));
            });
            setUnreadCount((prev) => {
                previousUnreadCount = prev;
                return Math.max(0, prev - 1);
            });

            await notificationsApi.markAsRead(id, token);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mark as read:', error);
            // Roll back the optimistic update — the server never confirmed the read.
            setNotifications(previousNotifications);
            setUnreadCount(previousUnreadCount);
        }
    };

    const markAllAsRead = async () => {
        let previousNotifications: NotificationType[] = [];
        let previousUnreadCount = 0;
        try {
            const token = await getTokenRef.current();
            if (!token) return;

            setNotifications((prev) => {
                previousNotifications = prev;
                return prev.map((n) => ({ ...n, read: true }));
            });
            setUnreadCount((prev) => {
                previousUnreadCount = prev;
                return 0;
            });

            await notificationsApi.markAllAsRead(token);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mark all as read:', error);
            // Roll back — a failed markAllAsRead must not leave the UI lying about read-state.
            setNotifications(previousNotifications);
            setUnreadCount(previousUnreadCount);
        }
    };

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
    };
}
