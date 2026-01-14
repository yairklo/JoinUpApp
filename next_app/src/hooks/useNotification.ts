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
                    if (token) setFcmToken(token);
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

    const requestPermission = async () => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const token = await requestForToken();
                if (token) setFcmToken(token);
            }
            return permission;
        }
        return 'denied';
    };

    return { fcmToken, notification, requestPermission };
};

export default useNotification;
