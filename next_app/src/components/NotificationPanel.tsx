'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    IconButton,
    Badge,
    Menu,
    MenuItem,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Button,
    CircularProgress,
    Typography,
    Box,
    Divider,
    Chip
} from '@mui/material';
import { Notifications as NotificationsIcon } from '@mui/icons-material';
import { useAuth } from '@clerk/nextjs';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

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
    const router = useRouter();
    const { userId, getToken } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [loading, setLoading] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);

    const open = Boolean(anchorEl);

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
            socketInstance.emit('join', `user_${userId}`);
        });

        socketInstance.on('notification', (data: Notification) => {
            console.log('[NOTIFICATIONS] Received real-time notification:', data);
            setNotifications(prev => [data, ...prev]);
            setUnreadCount(prev => prev + 1);

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

    useEffect(() => {
        if (open && userId) {
            fetchNotifications();
        }
    }, [open, userId]);

    useEffect(() => {
        if (!userId) return;

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [userId]);

    const fetchNotifications = async () => {
        if (!userId) return;

        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_URL}/api/notifications`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
                setUnreadCount(data.unreadCount || 0);
            } else {
                console.error('[NOTIFICATIONS] Fetch failed:', res.status, await res.text());
            }
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to fetch:', error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            const token = await getToken();
            await fetch(`${API_URL}/api/notifications/${id}/read`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
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
            const token = await getToken();
            await fetch(`${API_URL}/api/notifications/read-all`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
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
        setAnchorEl(null);
        if (notif.data?.link) {
            router.push(notif.data.link);
        }
    };

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    if (!userId) return null;

    return (
        <>
            <IconButton onClick={handleClick} color="inherit">
                <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon />
                </Badge>
            </IconButton>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                PaperProps={{
                    sx: {
                        width: 380,
                        maxHeight: 500,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">התראות</Typography>
                    {unreadCount > 0 && (
                        <Button size="small" onClick={markAllAsRead}>
                            סמן הכל כנקרא
                        </Button>
                    )}
                </Box>
                <Divider />

                {loading && notifications.length === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : notifications.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">אין התראות חדשות</Typography>
                    </Box>
                ) : (
                    <List sx={{ overflow: 'auto', flex: 1 }}>
                        {notifications.map((notif) => (
                            <ListItemButton
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                sx={{
                                    bgcolor: !notif.read ? 'action.hover' : 'transparent',
                                    borderLeft: !notif.read ? 3 : 0,
                                    borderColor: 'primary.main',
                                    '&:hover': {
                                        bgcolor: 'action.selected'
                                    }
                                }}
                            >
                                <ListItemText
                                    primary={
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 0.5 }}>
                                            <Typography
                                                variant="subtitle2"
                                                fontWeight="bold"
                                                sx={{
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    maxWidth: '250px'
                                                }}
                                            >
                                                {notif.title}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', ml: 1 }}>
                                                {formatTime(notif.createdAt)}
                                            </Typography>
                                        </Box>
                                    }
                                    secondary={
                                        <>
                                            <Typography variant="body2" color="text.secondary">
                                                {notif.body}
                                            </Typography>
                                            {!notif.read && (
                                                <Chip label="חדש" color="primary" size="small" sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }} />
                                            )}
                                        </>
                                    }
                                />
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </Menu>
        </>
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
