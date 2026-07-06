import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { io, Socket } from 'socket.io-client';
import { notificationsApi, chatsApi, Notification as NotificationType, API_BASE } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export function useNotifications() {
    const { userId, isLoaded, getToken } = useAuth();
    const { updateChatList } = useChat();

    const [notifications, setNotifications] = useState<NotificationType[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    // Fix #7: removed socketInstance from state (no re-render needed)
    const socketRef = useRef<Socket | null>(null);

    // Fix #7: cache permission status so we don't call getPermissionsAsync on every notification
    const permissionGrantedRef = useRef<boolean | null>(null);

    // 0. Request Push Permissions on Mount (once)
    useEffect(() => {
        const requestPermissions = async () => {
            if (!Device.isDevice) return;
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }
            // Fix #7: cache result so we never call getPermissionsAsync again
            permissionGrantedRef.current = finalStatus === 'granted';
        };
        requestPermissions();
    }, []);

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

    const getTokenRef = useRef(getToken);
    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    // 2. Socket Connection
    useEffect(() => {
        if (!userId) return;

        let socketInstance: Socket | null = null;

        const initSocket = async () => {
            try {
                const token = await getTokenRef.current();

                socketInstance = io(API_BASE, {
                    path: '/api/socket',
                    transports: ['websocket'],
                    auth: { token: token || '' }
                });

                socketInstance.on('connect', () => {
                    // Join personal room for targeted notifications
                    socketInstance?.emit('join', `user_${userId}`);
                    socketInstance?.emit('setup', { id: userId });
                    // Fix #7: removed chatsApi.getUserChats() from connect handler
                    // That was a heavy API call on every reconnect — chat rooms are
                    // joined by the chat screen's own socket in useChatLogic
                });

                socketInstance.on('connect_error', (error) => {
                    if (__DEV__) console.warn('[NOTIFICATIONS] Socket error:', error.message);
                });

                // Listen to message events to update chat list preview in real-time
                socketInstance.on('message', (incomingMsg: any) => {
                    updateChatList({
                        chatId: incomingMsg.roomId || incomingMsg.chatId,
                        roomId: incomingMsg.roomId || incomingMsg.chatId,
                        content: incomingMsg.text || incomingMsg.content,
                        text: incomingMsg.text || incomingMsg.content,
                        senderId: incomingMsg.userId || incomingMsg.senderId,
                        userId: incomingMsg.userId || incomingMsg.senderId,
                        ts: incomingMsg.ts || new Date().toISOString()
                    });
                });

                socketInstance.on('notification', async (data: any) => {
                    if (data.type === 'message') {
                        updateChatList({
                            chatId: data.roomId, roomId: data.roomId,
                            content: data.text, text: data.text,
                            senderId: data.senderId, userId: data.senderId,
                            ts: new Date().toISOString()
                        });
                    }

                    setNotifications(prev => [data, ...prev]);
                    setUnreadCount(prev => prev + 1);

                    // Fix #7: use cached permission status instead of calling getPermissionsAsync on every notification
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

                socketRef.current = socketInstance;
            } catch (e) {
                console.error('[NOTIFICATIONS] Error in initSocket:', e);
            }
        };

        initSocket();

        return () => {
            if (socketInstance) socketInstance.disconnect();
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
