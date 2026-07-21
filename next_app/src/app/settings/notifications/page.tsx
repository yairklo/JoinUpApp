'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

// MUI
import Container from '@mui/material/Container';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';

// Icons
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';

interface NotificationSettings {
    pushEnabled: boolean;
    friendRequestsEnabled: boolean;
    messagesEnabled: boolean;
    gameRemindersEnabled: boolean;
}

export default function NotificationSettingsPage() {
    const { userId } = useAuth();
    const [settings, setSettings] = useState<NotificationSettings>({
        pushEnabled: true,
        friendRequestsEnabled: true,
        messagesEnabled: true,
        gameRemindersEnabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (userId) {
            fetchSettings();
        }
    }, [userId]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/notifications/settings', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data) {
                    setSettings({
                        pushEnabled: data.pushEnabled ?? true,
                        friendRequestsEnabled: data.friendRequestsEnabled ?? true,
                        messagesEnabled: data.messagesEnabled ?? true,
                        gameRemindersEnabled: data.gameRemindersEnabled ?? true
                    });
                }
            }
        } catch (error) {
            console.error('[SETTINGS] Failed to fetch:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/notifications/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('__clerk_client_jwt')}`
                },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'ההגדרות נשמרו בהצלחה!' });
                setTimeout(() => setMessage(null), 3000);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('[SETTINGS] Failed to save:', error);
            setMessage({ type: 'error', text: 'שגיאה בשמירת ההגדרות. נסה שוב.' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = (key: keyof NotificationSettings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (!userId) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }}>
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                    עליך להתחבר כדי לנהל הגדרות התראות
                </Alert>
            </Container>
        );
    }

    if (loading) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
                <CircularProgress />
            </Container>
        );
    }

    const rows: Array<{
        key: keyof NotificationSettings;
        title: string;
        subtitle: string;
        icon: React.ReactNode;
        dependsOnPush?: boolean;
    }> = [
        {
            key: 'friendRequestsEnabled',
            title: 'בקשות חברות',
            subtitle: 'קבל התראה כשמישהו שולח לך בקשת חברות',
            icon: <PeopleAltOutlinedIcon />,
            dependsOnPush: true,
        },
        {
            key: 'messagesEnabled',
            title: 'הודעות חדשות',
            subtitle: "קבל התראה כשמגיעה הודעה חדשה בצ'אט",
            icon: <ChatBubbleOutlineIcon />,
            dependsOnPush: true,
        },
        {
            key: 'gameRemindersEnabled',
            title: 'תזכורות משחקים',
            subtitle: 'קבל תזכורת שעה לפני משחק שנרשמת אליו',
            icon: <AlarmOutlinedIcon />,
            dependsOnPush: true,
        },
    ];

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
            <Typography variant="h4" component="h1" fontWeight={800} mb={3}>
                הגדרות התראות
            </Typography>

            {message && (
                <Alert
                    severity={message.type}
                    onClose={() => setMessage(null)}
                    sx={{ mb: 2, borderRadius: 3 }}
                >
                    {message.text}
                </Alert>
            )}

            <Card elevation={0}>
                <CardContent sx={{ p: 3 }}>
                    {/* Master switch */}
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Box sx={{ color: 'primary.main', display: 'flex' }}>
                                <NotificationsActiveOutlinedIcon />
                            </Box>
                            <Box>
                                <Typography fontWeight={700}>הפעל התראות Push</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    קבל התראות בזמן אמת במכשיר שלך
                                </Typography>
                            </Box>
                        </Stack>
                        <Switch
                            checked={settings.pushEnabled}
                            onChange={() => handleToggle('pushEnabled')}
                        />
                    </Stack>

                    <Divider sx={{ my: 2.5 }} />

                    <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
                        סוגי התראות
                    </Typography>

                    <Stack spacing={2}>
                        {rows.map((row) => (
                            <Stack
                                key={row.key}
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                                sx={{ opacity: settings.pushEnabled ? 1 : 0.5 }}
                            >
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <Box sx={{ color: 'text.secondary', display: 'flex' }}>{row.icon}</Box>
                                    <Box>
                                        <Typography fontWeight={600}>{row.title}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {row.subtitle}
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Switch
                                    checked={settings[row.key]}
                                    onChange={() => handleToggle(row.key)}
                                    disabled={row.dependsOnPush && !settings.pushEnabled}
                                />
                            </Stack>
                        ))}
                    </Stack>

                    <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        onClick={handleSave}
                        disabled={saving}
                        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
                        sx={{ mt: 3.5 }}
                    >
                        {saving ? 'שומר...' : 'שמור הגדרות'}
                    </Button>
                </CardContent>
            </Card>

            <Card elevation={0} sx={{ mt: 2.5, bgcolor: 'action.hover', border: 'none' }}>
                <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                        <LightbulbOutlinedIcon fontSize="small" color="warning" />
                        <Typography fontWeight={700}>טיפים</Typography>
                    </Stack>
                    <Stack component="ul" spacing={0.75} sx={{ m: 0, paddingInlineStart: 2.5, color: 'text.secondary' }}>
                        <Typography component="li" variant="body2">כדי לקבל התראות, עליך לאשר הרשאות בדפדפן</Typography>
                        <Typography component="li" variant="body2">ההתראות יישלחו לכל המכשירים המחוברים שלך</Typography>
                        <Typography component="li" variant="body2">ניתן לכבות התראות ספציפיות בכל עת</Typography>
                    </Stack>
                </CardContent>
            </Card>
        </Container>
    );
}
