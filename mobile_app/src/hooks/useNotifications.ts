import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { SocketManager } from '@/services/socketManager';
import { notificationsApi, Notification as NotificationType } from '@/services/api';
import {
  isChatNotification,
  normalizeNotification,
  isPersistedNotificationId,
} from '@/utils/notificationDisplay';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const payload = (notification.request.content.data || {}) as Record<string, unknown>;
    const isChat = isChatNotification({
      type: payload.type as string,
      roomId: payload.roomId as string,
      data: payload,
    });
    const suppressForegroundChat = isChat && AppState.currentState === 'active';
    return {
      shouldShowBanner: !suppressForegroundChat,
      shouldShowList: !suppressForegroundChat,
      shouldPlaySound: !suppressForegroundChat,
      shouldSetBadge: true,
    };
  },
});

export function useNotifications() {
  const { userId, isLoaded, getToken } = useAuth();

  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const initialFetchDoneRef = useRef(false);

  const permissionGrantedRef = useRef<boolean | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const registerForPushNotifications = async () => {
      if (!Device.isDevice) return;
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
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

  const fetchNotifications = useCallback(async (options?: { showRefreshing?: boolean }) => {
    if (!userId) return;
    const showRefreshing = options?.showRefreshing ?? false;
    if (showRefreshing || !initialFetchDoneRef.current) {
      setLoading(true);
    }
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const data = await notificationsApi.getAll(token);
      const normalized = (data.notifications || [])
        .map((n, i) => normalizeNotification(n, i))
        .filter((n) => !isChatNotification(n));
      setNotifications(normalized);
      setUnreadCount(data.unreadCount || 0);
      initialFetchDoneRef.current = true;
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial fetch once when auth is ready — stable deps (no getToken / fetchNotifications churn)
  useEffect(() => {
    if (!isLoaded || !userId) {
      initialFetchDoneRef.current = false;
      return;
    }
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userId]);

  useEffect(() => {
    if (!userId) return;

    const setupPersonalRoom = () => {
      SocketManager.emit('join', `user_${userId}`);
      SocketManager.emit('setup', { id: userId });
    };

    setupPersonalRoom();
    const unsubscribeConnect = SocketManager.on('connect', setupPersonalRoom);

    const unsubscribeNotification = SocketManager.on('notification', async (data: Record<string, unknown>) => {
      // Chat messages never belong in the general notifications feed
      if (isChatNotification(data as Parameters<typeof isChatNotification>[0])) {
        return;
      }

      const isForeground = appStateRef.current === 'active';
      const normalized = normalizeNotification(data as Parameters<typeof normalizeNotification>[0]);

      setNotifications((prev) => {
        if (prev.some((n) => n.id === normalized.id)) return prev;
        return [normalized, ...prev];
      });
      if (!normalized.read) {
        setUnreadCount((prev) => prev + 1);
      }

      if (isForeground && permissionGrantedRef.current) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: normalized.title,
            body: normalized.body,
            data: {
              id: normalized.id,
              link: normalized.data?.link,
              gameId: normalized.data?.gameId,
              type: normalized.type,
            },
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

  const refreshNotifications = useCallback(() => {
    return fetchNotifications({ showRefreshing: true });
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      if (!isPersistedNotificationId(id)) return;

      const token = await getTokenRef.current();
      if (!token) return;
      await notificationsApi.markAsRead(id, token);
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);

      const token = await getTokenRef.current();
      if (!token) return;
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
    refreshNotifications,
  };
}
