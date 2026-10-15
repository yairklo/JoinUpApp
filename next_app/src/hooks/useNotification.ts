import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { requestForToken, onMessageListener, getMessagingReady } from '../utils/firebase';

/**
 * 'checking'           - support not known yet (render nothing)
 * 'supported'          - permission can be requested
 * 'ios-needs-install'  - iPhone/iPad Safari tab: web push only works from a Home Screen app (iOS 16.4+)
 * 'unsupported'        - no web push in this browser, or permission already denied
 */
export type PushSupport = 'checking' | 'supported' | 'ios-needs-install' | 'unsupported';

const isIOSDevice = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as Macintosh
    (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);

// Safari/WebKit: every iOS browser, plus desktop Safari. Must match IS_WEBKIT_SAFARI in
// public/firebase-messaging-sw.js, which always shows a system notification there.
const isWebKitSafari = () =>
    isIOSDevice() ||
    (/AppleWebKit/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) &&
        !/Chrome|Chromium|Edg|OPR|Android/.test(navigator.userAgent));

// In-app browsers (Instagram, Facebook, LINE, ...) can't "Add to Home Screen" - the page has
// to be opened in Safari first. (WhatsApp/iMessage use Safari View Controller, which can.)
const isIOSInAppBrowser = () =>
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|GSA\//.test(navigator.userAgent);

// Skip the register-device POST when this user already registered this exact token
// recently. Re-sent after a week anyway in case the server dropped the row.
const REGISTERED_KEY = (userId: string) => `joinup:fcmRegistered:${userId}`;
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const isAlreadyRegistered = (userId: string, token: string) => {
    try {
        const raw = localStorage.getItem(REGISTERED_KEY(userId));
        if (!raw) return false;
        const { token: saved, at } = JSON.parse(raw);
        return saved === token && Date.now() - at < REREGISTER_AFTER_MS;
    } catch {
        return false;
    }
};

const markRegistered = (userId: string, token: string) => {
    try {
        localStorage.setItem(REGISTERED_KEY(userId), JSON.stringify({ token, at: Date.now() }));
    } catch { /* storage unavailable - we'll just re-register next load */ }
};

const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

const useNotification = () => {
    const { getToken, userId } = useAuth();
    const [notification, setNotification] = useState<any>({ title: '', body: '' });
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [pushSupport, setPushSupport] = useState<PushSupport>('checking');
    const [iosInAppBrowser, setIosInAppBrowser] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let cancelled = false;

        // On iOS, web push only ever works from a Home Screen app - decide that first,
        // regardless of which push APIs a given iOS version exposes in a browser tab.
        if (isIOSDevice() && !isStandalone()) {
            setIosInAppBrowser(isIOSInAppBrowser());
            setPushSupport('ios-needs-install');
            return;
        }

        const hasWebPush = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
        if (!hasWebPush) {
            setPushSupport('unsupported');
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
        if (typeof window === 'undefined' || isWebKitSafari()) return;
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
