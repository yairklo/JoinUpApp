import { useEffect, useRef } from 'react';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import {
  NOTIFICATIONS_FALLBACK_ROUTE,
  resolveNotificationRoute,
} from '@/utils/notificationRoute';
import { notificationsApi } from '@/services/api';
import { isPersistedNotificationId } from '@/utils/notificationDisplay';

/**
 * Opens the right screen when the user taps a push notification — from a killed app (cold start),
 * the background, or the foreground. `useLastNotificationResponse` covers all three: it returns the
 * response that launched the app as well as later taps (the plain response listener misses cold start).
 * Navigation waits for Clerk to load, a signed-in session, the router to be mounted and the auth
 * redirects to settle; each response is handled once.
 */
// Module scope: survives a remount of the handler, so the same tap is never navigated twice.
let lastHandledKey: string | null = null;

export function usePushNavigation(onHandled?: () => void) {
  const response = Notifications.useLastNotificationResponse();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navState = useRootNavigationState();

  const ready = isLoaded && isSignedIn && !!navState?.key && segments.length > 0 && segments[0] !== 'sign-in' && segments[0] !== 'sign-up';

  useEffect(() => {
    if (!response || !ready) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (lastHandledKey === key) return;
    lastHandledKey = key;

    const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
    const target = resolveNotificationRoute({ type: data.type as string | undefined, data }) ?? NOTIFICATIONS_FALLBACK_ROUTE;
    router.push(target as never);

    const notificationId = typeof data.notificationId === 'string' ? data.notificationId : '';
    (async () => {
      try {
        const token = await getToken();
        if (token && notificationId && isPersistedNotificationId(notificationId)) {
          await notificationsApi.markAsRead(notificationId, token);
        }
      } catch {
        // best effort — the feed refresh below reflects whatever the server has
      }
      onHandled?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/getToken identity must not re-run handling
  }, [response, ready]);
}
