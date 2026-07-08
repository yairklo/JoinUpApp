import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { SocketManager } from '@/services/socketManager';
import { notificationsApi, chatsApi, Notification as NotificationType, API_BASE } from '@/services/api';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export function useNotifications() {
    const { userId, isLoaded, getToken } = useAuth();

    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);

    // Fix #7: cache permission status so we don't call getPermissionsAsync on every notification
    const permissionGrantedRef = useRef<boolean | null>(null);

    const getTokenRef = useRef(getToken);
    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    // 0. Request Push Permissions on Mount (once), then register the Expo push token with the backend
    useEffect(() => {
        const registerForPushNotifications = async () => {
            if (!Device.isDevice) return;
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            // Fix #7: cache result so we never call getPermissionsAsync again
            permissionGrantedRef.current = finalStatus === 'granted';
            if (finalStatus !== 'granted') return;
            if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

            try {
                const projectId = Constants.expoConfig?.extra?.eas?.projectId;
                const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
                    projectId ? { projectId } : undefined
                );
                const clerkToken = await getTokenRef.current();
                if (clerkToken) {
                    await notificationsApi.registerDevice(expoPushToken, Platform.OS, clerkToken);
                }
            } catch (error) {
                console.error('[NOTIFICATIONS] Failed to register Expo push token:', error);
            }
        };
        if (userId) registerForPushNotifications();
    }, [userId]);

    // 1. Fetch Notifications (Initial load only — real-time updates handled by socket)
    const fetchNotifications = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
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
    }, [userId]);

    // Initial fetch only — Fix #7: removed 30s polling (socket handles real-time updates)
    useEffect(() => {
        if (!isLoaded || !userId) return;
        fetchNotifications();
        // No interval — the socket below pushes live updates
    }, [isLoaded, userId]);

    // 2. Socket Connection via Singleton
    useEffect(() => {
        if (!userId) return;

        // Ensure we join the personal room
        const setupPersonalRoom = () => {
            SocketManager.emit('join', `user_${userId}`);
            SocketManager.emit('setup', { id: userId });
        };

        setupPersonalRoom();
        const unsubscribeConnect = SocketManager.on('connect', setupPersonalRoom);

        const unsubscribeNotification = SocketManager.on('notification', async (data: any) => {
            setNotifications(prev => [data, ...prev]);
            setUnreadCount(prev => prev + 1);

            if (permissionGrantedRef.current) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: data.title || 'JoinUp',
                        body: data.message || data.text || 'התקבלה התראה חדשה',
                        data: { id: data.id, link: data.link },
                    },
                    trigger: null,
                });
            }
        });

        return () => {
            unsubscribeConnect();
            unsubscribeNotification();
        };
    }, [userId]);
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
        markAllAsRead,
        refreshNotifications: fetchNotifications
    };
}
