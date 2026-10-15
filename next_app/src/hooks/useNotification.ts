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

const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

const useNotification = () => {
    const { getToken } = useAuth();
    const [notification, setNotification] = useState<any>({ title: '', body: '' });
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [pushSupport, setPushSupport] = useState<PushSupport>('checking');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let cancelled = false;

        const hasWebPush = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
        if (!hasWebPush) {
            setPushSupport(isIOSDevice() && !isStandalone() ? 'ios-needs-install' : 'unsupported');
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
                // Re-fetch on every load: FCM tokens rotate (notably on iOS), so the
                // backend must be told about the current one each time.
                requestForToken().then(token => {
                    if (token && !cancelled) {
                        setFcmToken(token);
                        registerDevice(token);
                    }
                });
            }
        });

        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        // Foreground messages are shown via the Snackbar in NotificationAsker.
        // The server sends data-only messages, so title/body live in payload.data.
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

    return { fcmToken, notification, requestPermission, pushSupport };
};

export default useNotification;
