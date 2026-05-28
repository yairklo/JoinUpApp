import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useSocket } from '@/context/SocketContext';
import { notificationsApi, Notification as NotificationType, API_BASE } from '@/services/api';

export function useNotifications() {
    const { userId, isLoaded, getToken } = useAuth();

    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const { socket, isConnected } = useSocket();

    // 1. Fetch Notifications (Initial + Polling)
    const fetchNotifications = useCallback(async () => {
        if (!userId) return;
        setLoading(prev => prev === false ? true : prev); // Only set true if not already loading to avoid flicker? Or maybe just set true.
        // Actually, for polling we might not want to set loading=true every time, but for initial load yes.
        // Let's stick to simple logic: Only set loading on first fetch? 
        // For now, let's just set it.

        try {
            const token = await getToken();
            if (!token) return;
            const data = await notificationsApi.getAll(token);
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to fetch:', error);
        } finally {
            setLoading(false);
        }
    }, [userId]); // Removed getToken to prevent infinite re-renders

    // Initial Fetch & Polling
    useEffect(() => {
        if (!isLoaded || !userId) return;

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [isLoaded, userId]); // Removed fetchNotifications to prevent infinite loop

    // 2. Socket Connection
    useEffect(() => {
        if (!userId || !socket || !isConnected) return;

        // Emit initial join
        socket.emit('join', `user_${userId}`);

        // Event Handlers
        const handleNotification = (data: NotificationType) => {
            console.log('[NOTIFICATIONS] Received real-time notification:', data);
            setNotifications(prev => [data, ...prev]);
            setUnreadCount(prev => prev + 1);

            if (Notification.permission === 'granted') {
                new Notification(data.title, {
                    body: data.body,
                    icon: '/icon-192x192.png'
                });
            }
        };

        socket.on('notification', handleNotification);

        return () => {
            socket.off('notification', handleNotification);
        };
    }, [userId, socket, isConnected]);


    // 3. Actions
    const markAsRead = async (id: string) => {
        try {
            const token = await getToken();
            if (!token) return;

            // Optimistic update
            setNotifications(prev =>
                prev.map(n => (n.id === id ? { ...n, read: true } : n))
            );
            setUnreadCount(prev => Math.max(0, prev - 1));

            await notificationsApi.markAsRead(id, token);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mark as read:', error);
            // Revert on error? For now, keep simple.
        }
    };

    const markAllAsRead = async () => {
        try {
            const token = await getToken();
            if (!token) return;

            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);

            await notificationsApi.markAllAsRead(token);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mark all as read:', error);
        }
    };

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead
    };
}
