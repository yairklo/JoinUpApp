'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    IconButton,
    Badge,
    Menu,
    List,
    ListItemButton,
    ListItemText,
    Button,
    Typography,
    Box,
    Divider,
    Chip,
    MenuItem,
    ListItemIcon,
    Snackbar,
    Alert,
    Paper,
    Stack
} from '@mui/material';
import {
    Notifications as NotificationsIcon,
    SettingsOutlined as SettingsOutlinedIcon,
    MoreVert as MoreVertIcon,
    NotificationsOffOutlined as NotificationsOffOutlinedIcon,
    VolumeOffOutlined as VolumeOffOutlinedIcon,
} from '@mui/icons-material';
import {
    NOTIFICATION_CATEGORIES,
    CATEGORY_BY_NOTIFICATION_TYPE,
    ALWAYS_DELIVERED_TYPES,
    QUICK_OFF_EXCLUDED_CATEGORIES,
    type NotificationSettingsUpdate,
} from '@joinup/shared/notificationPrefs';
import { useAuth } from '@clerk/nextjs';
import { useNotifications } from '@/hooks/useNotifications';
import LoadingMotif from "@/components/motion/LoadingMotif";
import { Notification, notificationsApi } from '@/services/api/notifications';
import { chatsApi } from '@/services/api/chats';
import { resolveNotificationRoute } from '@/utils/notificationRoute';

export default function NotificationPanel() {
    const router = useRouter();
    const { userId, getToken } = useAuth(); // Just to check if we should render
    const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [itemMenu, setItemMenu] = useState<{ anchor: HTMLElement; notif: Notification } | null>(null);
    const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
    const [showCityPrompt, setShowCityPrompt] = useState(false);
    const cityPromptChecked = useRef(false);

    // One-time suggestion: city games arrive in-app only by default. When the user is actually
    // looking at one, offer push for them — once (the answer is stored server-side).
    const hasCityNotification = notifications.some(n => n.type === 'NEW_GAME_IN_CITY');
    useEffect(() => {
        if (!anchorEl || !hasCityNotification || cityPromptChecked.current) return;
        cityPromptChecked.current = true;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const s = await notificationsApi.getSettings(token);
                setShowCityPrompt(s.pushEnabled && !s.cityGamesPush && !s.cityPromptDismissedAt);
            } catch (error) {
                console.error('[NOTIFICATIONS] Failed to load settings for city prompt:', error);
            }
        })();
    }, [anchorEl, hasCityNotification, getToken]);

    const answerCityPrompt = async (enable: boolean) => {
        setShowCityPrompt(false);
        try {
            const token = await getToken();
            if (!token) return;
            await notificationsApi.updateSettings(
                { cityPromptDismissedAt: new Date().toISOString(), ...(enable ? { cityGamesPush: true } : {}) },
                token
            );
            if (enable) setToast({ text: 'תקבל פוש על משחקים חדשים בעיר. אפשר לסנן לפי ענף בהגדרות.' });
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to save city prompt answer:', error);
        }
    };

    const updateSettings = async (changes: NotificationSettingsUpdate) => {
        const token = await getToken();
        if (!token) throw new Error('No auth token');
        return notificationsApi.updateSettings(changes, token);
    };

    const turnOffLikeThis = async (notif: Notification) => {
        setItemMenu(null);
        const cat = NOTIFICATION_CATEGORIES.find(c => c.key === CATEGORY_BY_NOTIFICATION_TYPE[notif.type]);
        if (!cat) return;
        const off: NotificationSettingsUpdate = { [cat.pushField]: false, ...(cat.inAppField ? { [cat.inAppField]: false } : {}) };
        try {
            await updateSettings(off);
            setToast({
                text: 'לא תקבל יותר התראות מהסוג הזה',
                undo: () => {
                    const on: NotificationSettingsUpdate = { [cat.pushField]: true, ...(cat.inAppField ? { [cat.inAppField]: true } : {}) };
                    updateSettings(on).catch(err => console.error('[NOTIFICATIONS] Undo failed:', err));
                },
            });
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to turn off category:', error);
            setToast({ text: 'הפעולה נכשלה. נסה שוב.' });
        }
    };

    const muteTarget = async (targetType: 'USER' | 'GAME', targetId: string) => {
        setItemMenu(null);
        try {
            const token = await getToken();
            if (!token) return;
            await notificationsApi.mute(targetType, targetId, null, token);
            setToast({
                text: targetType === 'USER' ? 'התראות מהמשתמש הזה הושתקו' : 'התראות על המשחק הזה הושתקו',
                undo: async () => {
                    const t = await getToken();
                    if (t) notificationsApi.unmute(targetType, targetId, t).catch(err => console.error('[NOTIFICATIONS] Undo failed:', err));
                },
            });
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to mute:', error);
            setToast({ text: 'ההשתקה נכשלה. נסה שוב.' });
        }
    };

    const handleDirectMessage = async (e: React.MouseEvent, targetUserId: string) => {
        e.stopPropagation();
        try {
            const token = await getToken();
            if (!token) return;
            const res = await chatsApi.createPrivate(targetUserId, token);
            if (res && res.chatId) {
                setAnchorEl(null);
                router.push(`/chat/${res.chatId}`);
            }
        } catch (error) {
            console.error('Failed to create/open private chat:', error);
        }
    };

    const open = Boolean(anchorEl);

    const handleNotificationClick = (notif: Notification) => {
        markAsRead(notif.id);
        setAnchorEl(null);
        // The raw `link` string is shared across platforms and is mobile-style (`/game/[id]`,
        // `/friends`), which 404s on Next.js -- resolve the web route from the type/ids instead.
        const target = resolveNotificationRoute(notif);
        if (target) {
            router.push(target);
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
            <IconButton onClick={handleClick} color="inherit" aria-label="התראות" data-testid="notifications-bell">
                <Badge badgeContent={unreadCount} color="error">
                    <NotificationsIcon />
                </Badge>
            </IconButton>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                MenuListProps={{
                    disablePadding: true,
                    sx: {
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        height: '100%',
                    },
                }}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 380 },
                        maxHeight: { xs: '80vh', sm: 500 },
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                    }
                }}
            >
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">התראות</Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        {unreadCount > 0 && (
                            <Button size="small" onClick={markAllAsRead}>
                                סמן הכל כנקרא
                            </Button>
                        )}
                        <IconButton
                            size="small"
                            component={Link}
                            href="/settings/notifications"
                            onClick={handleClose}
                            aria-label="הגדרות התראות"
                        >
                            <SettingsOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Box>
                <Divider />

                {showCityPrompt && (
                    <Paper elevation={0} sx={{ m: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                        <Typography variant="body2" fontWeight={600} mb={1}>
                            לקבל גם פוש כשנפתח משחק חדש בעיר שלך?
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="contained" onClick={() => answerCityPrompt(true)}>כן, הפעל</Button>
                            <Button size="small" onClick={() => answerCityPrompt(false)}>לא תודה</Button>
                        </Stack>
                    </Paper>
                )}

                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {loading && notifications.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4, flex: 1 }}>
                            <LoadingMotif id="message-stack" />
                        </Box>
                    ) : notifications.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                            <Typography color="text.secondary">אין התראות חדשות</Typography>
                        </Box>
                    ) : (
                        <List
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                overflowY: 'auto',
                                WebkitOverflowScrolling: 'touch',
                            }}
                        >
                            {notifications.map((notif) => (
                                <ListItemButton
                                    key={notif.id}
                                    data-testid="notification-item"
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
                                                <Stack direction="row" alignItems="center" sx={{ ml: 1 }}>
                                                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                                                        {formatTime(notif.createdAt)}
                                                    </Typography>
                                                    {!ALWAYS_DELIVERED_TYPES.includes(notif.type) && CATEGORY_BY_NOTIFICATION_TYPE[notif.type] && (
                                                        <IconButton
                                                            size="small"
                                                            aria-label="אפשרויות התראה"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setItemMenu({ anchor: e.currentTarget, notif });
                                                            }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            sx={{ p: 0.25, ml: 0.5 }}
                                                        >
                                                            <MoreVertIcon fontSize="small" />
                                                        </IconButton>
                                                    )}
                                                </Stack>
                                            </Box>
                                        }
                                        secondary={
                                            <>
                                                <Typography variant="body2" color="text.secondary">
                                                    {notif.body}
                                                </Typography>
                                                {notif.data?.userId && (
                                                    <Box sx={{ mt: 1 }}>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={(e) => handleDirectMessage(e, notif.data!.userId)}
                                                        >
                                                            שלח הודעה
                                                        </Button>
                                                    </Box>
                                                )}
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
                </Box>
            </Menu>

            <Menu anchorEl={itemMenu?.anchor} open={!!itemMenu} onClose={() => setItemMenu(null)}>
                {itemMenu && !QUICK_OFF_EXCLUDED_CATEGORIES.includes(CATEGORY_BY_NOTIFICATION_TYPE[itemMenu.notif.type]) && (
                    <MenuItem onClick={() => turnOffLikeThis(itemMenu.notif)}>
                        <ListItemIcon><NotificationsOffOutlinedIcon fontSize="small" /></ListItemIcon>
                        כבה התראות מהסוג הזה
                    </MenuItem>
                )}
                {itemMenu && typeof itemMenu.notif.data?.actorId === 'string' && itemMenu.notif.data.actorId !== userId && (
                    <MenuItem onClick={() => muteTarget('USER', itemMenu.notif.data!.actorId as string)}>
                        <ListItemIcon><VolumeOffOutlinedIcon fontSize="small" /></ListItemIcon>
                        השתק התראות מהמשתמש הזה
                    </MenuItem>
                )}
                {itemMenu && typeof itemMenu.notif.data?.gameId === 'string' && (
                    <MenuItem onClick={() => muteTarget('GAME', itemMenu.notif.data!.gameId as string)}>
                        <ListItemIcon><VolumeOffOutlinedIcon fontSize="small" /></ListItemIcon>
                        השתק את המשחק הזה
                    </MenuItem>
                )}
                <Divider />
                <MenuItem component={Link} href="/settings/notifications" onClick={() => { setItemMenu(null); handleClose(); }}>
                    <ListItemIcon><SettingsOutlinedIcon fontSize="small" /></ListItemIcon>
                    כל הגדרות ההתראות
                </MenuItem>
            </Menu>

            <Snackbar
                open={!!toast}
                autoHideDuration={5000}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {toast ? (
                    <Alert
                        severity="info"
                        variant="filled"
                        onClose={() => setToast(null)}
                        action={toast.undo ? (
                            <Button color="inherit" size="small" onClick={() => { toast.undo?.(); setToast(null); }}>
                                בטל
                            </Button>
                        ) : undefined}
                        sx={{ borderRadius: 3 }}
                    >
                        {toast.text}
                    </Alert>
                ) : undefined}
            </Snackbar>
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
