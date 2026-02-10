import { useEffect, useState } from 'react';
import { requestForToken, onMessageListener } from '../utils/firebase';

const useNotification = () => {
    const [notification, setNotification] = useState<any>({ title: '', body: '' });
    const [fcmToken, setFcmToken] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                // Automatically fetch token if allowed
                requestForToken().then(token => {
                    if (token) {
                        setFcmToken(token);
                        // Register device with backend
                        registerDevice(token);
                    }
                });
            }
        }
    }, []);

    useEffect(() => {
        const listen = async () => {
            onMessageListener().then((payload: any) => {
                setNotification({
                    title: payload?.notification?.title,
                    body: payload?.notification?.body,
                });
                // You can use a custom toast here. For now standard alert or simple UI update.
                alert(`New Notification: ${payload?.notification?.title}\n${payload?.notification?.body}`);
                console.log("Received foreground message:", payload);
            });
        };

        listen();
    }, []); // single initialization

    const registerDevice = async (token: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';
            console.log('[NOTIFICATION] Registering device to:', `${apiUrl}/api/notifications/register-device`);

            const response = await fetch(`${apiUrl}/api/notifications/register-device`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
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
            return permission;
        }
        return 'denied';
    };

    return { fcmToken, notification, requestPermission };
};

export default useNotification;
