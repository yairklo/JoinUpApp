import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { io, Socket } from 'socket.io-client';
import { notificationsApi, Notification as NotificationType, API_BASE } from '@/services/api';

export function useNotifications() {
    const { userId, isLoaded, getToken } = useAuth();

    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);

    const socketRef = useRef<Socket | null>(null);

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
    }, [userId, getToken]);

    // Initial Fetch & Polling
    useEffect(() => {
        if (!isLoaded || !userId) return;

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [isLoaded, userId, fetchNotifications]);

    // 2. Socket Connection
    useEffect(() => {
        if (!userId) return;

        let socketInstance: Socket | null = null;

        const initSocket = async () => {
            const token = await getToken(); // Get token for auth if needed, though current implementation used localStorage. 
            // Ideally we pass token in auth object.
            // The original code used localStorage.getItem('__clerk_client_jwt'). 
            // We should try to use the token from hook if possible, or fallback to the cookie/storage if Clerk handles it.
            // `io` options auth: { token } is standard.

            socketInstance = io(API_BASE, {
                path: '/api/socket',
                auth: {
                    token: token || ""
                }
            });

            socketInstance.on('connect', () => {
                console.log('[NOTIFICATIONS] Socket connected');
                socketInstance?.emit('join', `user_${userId}`);
            });

            socketInstance.on('notification', (data: NotificationType) => {
                console.log('[NOTIFICATIONS] Received real-time notification:', data);
                setNotifications(prev => [data, ...prev]);
                setUnreadCount(prev => prev + 1);

                if (Notification.permission === 'granted') {
                    new Notification(data.title, {
                        body: data.body,
                        icon: '/icon-192x192.png'
                    });
                }
            });

            setSocket(socketInstance);
            socketRef.current = socketInstance;
        };

        initSocket();

        return () => {
            if (socketInstance) socketInstance.disconnect();
        };
    }, [userId, getToken]);


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
