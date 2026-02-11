'use client';

import { useState, useEffect } from 'react';
import useNotification from '@/hooks/useNotification';
import { useAuth } from '@clerk/nextjs';

export default function TestNotificationPage() {
    const { fcmToken, requestPermission } = useNotification();
    const { userId } = useAuth();
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPermissionStatus(Notification.permission);
        }
    }, []);

    const handleRequestPermission = async () => {
        const perm = await requestPermission();
        setPermissionStatus(perm as NotificationPermission);
    };

    const sendTestBrowserNotification = () => {
        if (permissionStatus === 'granted') {
            new Notification('Test Notification', {
                body: 'This is a test notification from the browser directly.',
                icon: '/icon-192x192.png'
            });
        } else {
            alert('Permission not granted! Current status: ' + permissionStatus);
        }
    };

    return (
        <div style={{ padding: '50px', maxWidth: '600px', margin: '0 auto' }}>
            <h1>🔔 Notification Debugger</h1>

            <div style={{ margin: '20px 0', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
                <h3>Status</h3>
                <p><strong>User ID:</strong> {userId || 'Not Logged In'}</p>
                <p><strong>Permission:</strong> {permissionStatus}</p>
                <p><strong>FCM Token:</strong></p>
                <textarea
                    readOnly
                    value={fcmToken || 'Loading/Not Registered...'}
                    style={{ width: '100%', height: '100px', fontSize: '12px' }}
                />
            </div>

            <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                <button
                    onClick={handleRequestPermission}
                    style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                >
                    1. Request Permission / Get Token
                </button>

                <button
                    onClick={sendTestBrowserNotification}
                    style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                >
                    2. Test Local Browser Notification
                </button>

                <p style={{ fontSize: '12px', color: '#666' }}>
                    * Button 2 tests if your browser can display notifications at all (bypassing Firebase).
                    If this doesn't work, check Windows Focus Assist / Browser Settings.
                </p>
            </div>
        </div>
    );
}
