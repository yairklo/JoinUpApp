import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
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
import i18n from '@/i18n';
import { getInstallationId } from '@/services/installationId';
import { pushLocaleFor, rememberPushRegistration } from '@/services/pushLocale';

let pushRegistrationErrorLogged = false;

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
  const getTokenRef = useRef(getToken);
  const fetchNotificationsRef = useRef<(() => Promise<void>) | null>(null);
  const notificationsRef = useRef<NotificationType[]>([]);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Socket events are missed while backgrounded and a push may land before the socket reconnects:
  // re-sync the feed + unread count on foreground and whenever a push is received.
  useEffect(() => {
    if (!userId) return;
    const refresh = () => { fetchNotificationsRef.current?.(); };
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    const pushSub = Notifications.addNotificationReceivedListener(refresh);
    return () => {
      appSub.remove();
      pushSub.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      return;
    }
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount, userId]);

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

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        console.log('[NOTIFICATIONS] Got Expo push token:', expoPushToken);
        const clerkToken = await getTokenRef.current();
        if (clerkToken) {
          rememberPushRegistration(expoPushToken, () => getTokenRef.current());
          await notificationsApi.registerDevice(expoPushToken, Platform.OS, clerkToken, pushLocaleFor(i18n.language), await getInstallationId());
          console.log('[NOTIFICATIONS] Registered device token with backend successfully');
        }
      } catch (error) {
        if (!pushRegistrationErrorLogged) {
          pushRegistrationErrorLogged = true;
          console.error('[NOTIFICATIONS] Failed to register Expo push token:', error);
        }
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
      notificationsRef.current = normalized;
      setNotifications(normalized);
      setUnreadCount(data.unreadCount || 0);
      initialFetchDoneRef.current = true;
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  fetchNotificationsRef.current = () => fetchNotifications();

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

    // In-app feed only. The device banner comes from the server's Expo push; scheduling a local
    // notification here as well showed every foreground event twice.
    const unsubscribeNotification = SocketManager.on('notification', (data: Record<string, unknown>) => {
      // Chat messages never belong in the general notifications feed
      if (isChatNotification(data as Parameters<typeof isChatNotification>[0])) {
        return;
      }

      const normalized = normalizeNotification(data as Parameters<typeof normalizeNotification>[0]);

      // A push-triggered refetch can land before the socket event: don't count the same row twice.
      const alreadyKnown = notificationsRef.current.some((n) => n.id === normalized.id);
      if (!alreadyKnown) notificationsRef.current = [normalized, ...notificationsRef.current];
      setNotifications((prev) => {
        if (prev.some((n) => n.id === normalized.id)) return prev;
        return [normalized, ...prev];
      });
      if (!normalized.read && !alreadyKnown) {
        setUnreadCount((prev) => prev + 1);
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
      const wasUnread = notificationsRef.current.some((n) => n.id === id && !n.read);
      notificationsRef.current = notificationsRef.current.map((n) => (n.id === id ? { ...n, read: true } : n));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));

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
      await fetchNotifications();
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
