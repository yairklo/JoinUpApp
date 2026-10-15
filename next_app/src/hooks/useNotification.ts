import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { requestForToken, onMessageListener, getMessagingReady } from '../utils/firebase';
import { detectPushSupport, isWebKitSafari, readPushEnv, PushSupport } from '../utils/pushSupport';

export type { PushSupport };

// Skip the register-device POST only when the LAST registration from this browser was
// the same user with the same token, within the last week (in case the server dropped
// the row). One entry per browser, not per user: the server gives a token to whichever
// user registered it last, so any user switch on a shared browser (A -> B -> A) must
// re-register.
const REGISTERED_KEY = 'joinup:fcmRegistration';
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const isAlreadyRegistered = (userId: string, token: string) => {
    try {
        const raw = localStorage.getItem(REGISTERED_KEY);
        if (!raw) return false;
        const last = JSON.parse(raw);
        return last.userId === userId && last.token === token && Date.now() - last.at < REREGISTER_AFTER_MS;
    } catch {
        return false;
    }
};

const markRegistered = (userId: string, token: string) => {
    try {
        localStorage.setItem(REGISTERED_KEY, JSON.stringify({ userId, token, at: Date.now() }));
    } catch { /* storage unavailable - we'll just re-register next load */ }
};

const useNotification = () => {
    const { getToken, userId } = useAuth();
    const [notification, setNotification] = useState<any>({ title: '', body: '' });
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [pushSupport, setPushSupport] = useState<PushSupport>('checking');
    const [iosInAppBrowser, setIosInAppBrowser] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let cancelled = false;

        const detected = detectPushSupport(readPushEnv());
        setIosInAppBrowser(detected.iosInAppBrowser);
        if (detected.support !== 'needs-messaging-check') {
            setPushSupport(detected.support);
            return;
        }

        getMessagingReady().then(messaging => {
            if (cancelled) return;
            if (!messaging || Notification.permission === 'denied') {
                setPushSupport('unsupported');
                return;
            }
            setPushSupport('supported');
            if (Notification.permission === 'granted') {
                // Re-fetch on every load: FCM tokens rotate (notably on iOS). Only POST
                // to the backend when the token changed (or the cache is stale).
                requestForToken().then(token => {
                    if (token && !cancelled) {
                        setFcmToken(token);
                        if (userId && !isAlreadyRegistered(userId, token)) registerDevice(token);
                    }
                });
            }
        });

        return () => { cancelled = true; };
    }, [userId]);

    useEffect(() => {
        // Foreground messages are shown via the Snackbar in NotificationAsker.
        // The server sends data-only messages, so title/body live in payload.data.
        // On Safari/WebKit the service worker already showed a system notification for
        // this message (iOS requires it), so don't repeat it in-app.
        if (typeof window === 'undefined' || isWebKitSafari(navigator.userAgent, 'ontouchend' in document)) return;
        return onMessageListener((payload) => {
            setNotification({
                title: payload?.data?.title ?? payload?.notification?.title,
                body: payload?.data?.body ?? payload?.notification?.body,
            });
        });
    }, []); // single initialization

    const registerDevice = async (token: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
            console.log('[NOTIFICATION] Registering device to:', `${apiUrl}/api/notifications/register-device`);

            const response = await fetch(`${apiUrl}/api/notifications/register-device`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${await getToken()}`
                },
                body: JSON.stringify({
                    fcmToken: token,
                    deviceType: 'web',
                    deviceName: navigator.userAgent.substring(0, 100) // Truncate for DB
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[NOTIFICATION] Registration failed:', response.status, errorText);
                throw new Error(`Registration failed: ${response.status}`);
            }

            if (userId) markRegistered(userId, token);
            console.log('[NOTIFICATION] Device registered successfully');
        } catch (error) {
            console.error('[NOTIFICATION] Failed to register device:', error);
        }
    };

    const requestPermission = async () => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const token = await requestForToken();
                if (token) {
                    setFcmToken(token);
                    await registerDevice(token);
                }
            }
            if (permission === 'denied') setPushSupport('unsupported');
            return permission;
        }
        return 'denied';
    };

    return { fcmToken, notification, requestPermission, pushSupport, iosInAppBrowser };
};

export default useNotification;
