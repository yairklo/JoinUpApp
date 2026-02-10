'use client';
import { useState, useEffect } from 'react';
import { Badge, Dropdown, ListGroup, Button, Spinner } from 'react-bootstrap';
import { BellFill } from 'react-bootstrap-icons';
import { useAuth } from '@clerk/nextjs';
import { io, Socket } from 'socket.io-client';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
    data?: {
        link?: string;
        [key: string]: any;
    };
}

export default function NotificationPanel() {
    const { userId } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [show, setShow] = useState(false);
    const [loading, setLoading] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);

    // Initialize Socket.IO connection
    useEffect(() => {
        if (!userId) return;

        const socketInstance = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005', {
            path: '/api/socket',
            auth: {
                token: localStorage.getItem('__clerk_client_jwt') || ''
            }
        });

        socketInstance.on('connect', () => {
            console.log('[NOTIFICATIONS] Socket connected');
            // Join user-specific room for notifications
            socketInstance.emit('join', `user_${userId}`);
        });

        // Listen for real-time notifications
        socketInstance.on('notification', (data: Notification) => {
            console.log('[NOTIFICATIONS] Received real-time notification:', data);
            setNotifications(prev => [data, ...prev]);
            setUnreadCount(prev => prev + 1);

            // Optional: Show browser notification if permission granted
            if (Notification.permission === 'granted') {
                new Notification(data.title, {
                    body: data.body,
                    icon: '/icon-192x192.png'
                });
            }
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [userId]);

    // Fetch notifications on mount and when dropdown opens
    useEffect(() => {
        if (show && userId) {
            fetchNotifications();
        }
    }, [show, userId]);

    // Poll for new notifications every 30 seconds (backup for WebSocket)
    useEffect(() => {
        if (!userId) return;

        fetchNotifications(); // Initial fetch
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [userId]);

    const fetchNotifications = async () => {
        if (!userId) return;

        setLoading(true);
        try {
            const res = await fetch('/api/notifications', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            }
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to fetch:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                }
            });

            setNotifications(prev =>
                prev.map(n => (n.id === id ? { ...n, read: true } : n))
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mark as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications/read-all', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                }
            });

            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mark all as read:', error);
        }
    };

    const handleNotificationClick = (notif: Notification) => {
        markAsRead(notif.id);
        if (notif.data?.link) {
            window.location.href = notif.data.link;
        }
        setShow(false);
    };

    if (!userId) return null;

    return (
        <Dropdown show={show} onToggle={setShow} align="end">
            <Dropdown.Toggle
                variant="link"
                className="position-relative p-2 text-decoration-none"
                style={{ color: 'inherit' }}
            >
                <BellFill size={24} />
                {unreadCount > 0 && (
                    <Badge
                        bg="danger"
                        pill
                        className="position-absolute top-0 start-100 translate-middle"
                        style={{ fontSize: '0.7rem' }}
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                )}
            </Dropdown.Toggle>

            <Dropdown.Menu style={{ width: '380px', maxHeight: '500px', overflowY: 'auto' }}>
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                    <h6 className="mb-0 fw-bold">התראות</h6>
                    {unreadCount > 0 && (
                        <Button
                            size="sm"
                            variant="link"
                            onClick={markAllAsRead}
                            className="text-decoration-none p-0"
                        >
                            סמן הכל כנקרא
                        </Button>
                    )}
                </div>

                {loading && notifications.length === 0 ? (
                    <div className="text-center py-4">
                        <Spinner animation="border" size="sm" />
                    </div>
                ) : notifications.length === 0 ? (
                    <ListGroup.Item className="text-center text-muted py-4">
                        אין התראות חדשות
                    </ListGroup.Item>
                ) : (
                    <ListGroup variant="flush">
                        {notifications.map((notif) => (
                            <ListGroup.Item
                                key={notif.id}
                                action
                                onClick={() => handleNotificationClick(notif)}
                                className={`${!notif.read ? 'bg-light border-start border-primary border-3' : ''} cursor-pointer`}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="d-flex justify-content-between align-items-start mb-1">
                                    <strong className="text-truncate" style={{ maxWidth: '250px' }}>
                                        {notif.title}
                                    </strong>
                                    <small className="text-muted ms-2" style={{ whiteSpace: 'nowrap' }}>
                                        {formatTime(notif.createdAt)}
                                    </small>
                                </div>
                                <div className="text-muted small">{notif.body}</div>
                                {!notif.read && (
                                    <Badge bg="primary" className="mt-1" style={{ fontSize: '0.65rem' }}>
                                        חדש
                                    </Badge>
                                )}
                            </ListGroup.Item>
                        ))}
                    </ListGroup>
                )}
            </Dropdown.Menu>
        </Dropdown>
    );
}

function formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `לפני ${diffMins} דקות`;
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    if (diffDays < 7) return `לפני ${diffDays} ימים`;

    return date.toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
    });
}
