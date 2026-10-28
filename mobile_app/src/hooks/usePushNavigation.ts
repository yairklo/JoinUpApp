import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import { resolveNotificationRoute } from '@/utils/notificationRoute';
import { shouldHandlePushTap } from '@/utils/pushTapGuard';
import { notificationsApi } from '@/services/api';
import { isPersistedNotificationId } from '@/utils/notificationDisplay';

/**
 * Opens the right screen when the user taps a push notification — from a killed app (cold start),
 * the background, or the foreground. `useLastNotificationResponse` covers all three: it returns the
 * response that launched the app as well as later taps (the plain response listener misses cold start).
 * Navigation waits for Clerk to load, a signed-in session, the router to be mounted and the auth
 * redirects to settle; each response is handled once.
 */
const HANDLED_KEY = 'joinup.lastHandledPushId';

export function usePushNavigation(onHandled?: () => void) {
  const response = Notifications.useLastNotificationResponse();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navState = useRootNavigationState();
  // The hook re-delivers the last tap on every launch, so the handled id must survive restarts.
  const lastHandledRef = useRef<string | null>(null);
  const [guardLoaded, setGuardLoaded] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(HANDLED_KEY)
      .then((v) => { lastHandledRef.current = v; })
      .catch(() => {})
      .finally(() => setGuardLoaded(true));
  }, []);

  const ready = guardLoaded && isLoaded && isSignedIn && !!navState?.key && segments.length > 0 && segments[0] !== 'sign-in' && segments[0] !== 'sign-up';

  useEffect(() => {
    if (!response || !ready) return;
    // id + date: a server that reuses a request identifier must still get each tap handled.
    const identifier = `${response.notification.request.identifier}:${response.notification.date}`;
    if (!shouldHandlePushTap({
      actionIdentifier: response.actionIdentifier,
      defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      identifier,
      date: response.notification.date,
      lastHandledId: lastHandledRef.current,
      now: Date.now(),
    })) return;

    lastHandledRef.current = identifier;
    SecureStore.setItemAsync(HANDLED_KEY, identifier).catch(() => {});
    try { Notifications.clearLastNotificationResponse(); } catch { /* older native module */ }

    const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
    const target = resolveNotificationRoute({ type: data.type as string | undefined, data });
    // Nothing to open: stay where the app launched rather than hijacking the launch.
    if (target) router.push(target as never);

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
