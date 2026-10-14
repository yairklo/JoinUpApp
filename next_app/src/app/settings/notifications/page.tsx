'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import Snackbar from '@mui/material/Snackbar';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';
import LoadingMotif from "@/components/motion/LoadingMotif";

// Icons
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import NotificationsPausedOutlinedIcon from '@mui/icons-material/NotificationsPausedOutlined';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined';

import NotificationCategoryMatrix from '@/components/notifications/NotificationCategoryMatrix';
import NotificationMutesList from '@/components/notifications/NotificationMutesList';
import { notificationsApi } from '@/services/api/notifications';
import {
    SNOOZE_HOURS_OPTIONS,
    minutesToHHMM,
    HHMMToMinutes,
    type NotificationSettings,
    type NotificationSettingsUpdate,
    type NotificationMute,
} from '@joinup/shared/notificationPrefs';

const SAVE_DEBOUNCE_MS = 400;

function browserTimezone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
        return null;
    }
}

function SectionCard({ icon, title, subtitle, action, children }: {
    icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode; children?: React.ReactNode;
}) {
    return (
        <Card elevation={0}>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography fontWeight={700}>{title}</Typography>
                            {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
                        </Box>
                    </Stack>
                    {action}
                </Stack>
                {children}
            </CardContent>
        </Card>
    );
}

export default function NotificationSettingsPage() {
    const { userId, isLoaded, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

    const [settings, setSettings] = useState<NotificationSettings | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [toast, setToast] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
    const [snoozeAnchor, setSnoozeAnchor] = useState<HTMLElement | null>(null);
    const [busyMute, setBusyMute] = useState<string | null>(null);

    // Last state confirmed by the server — what we roll back to when a save fails.
    const confirmedRef = useRef<NotificationSettings | null>(null);
    const pendingRef = useRef<NotificationSettingsUpdate>({});
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const data = await notificationsApi.getSettings(token);
            confirmedRef.current = data;
            setSettings(data);
        } catch (error) {
            console.error('[SETTINGS] Failed to load notification settings:', error);
            setLoadError(true);
        }
    }, []);

    useEffect(() => {
        if (isLoaded && userId) load();
    }, [isLoaded, userId, load]);

    const flush = useCallback(async () => {
        timerRef.current = null;
        const changes = pendingRef.current;
        pendingRef.current = {};
        if (Object.keys(changes).length === 0) return;
        try {
            const token = await getTokenRef.current();
            if (!token) throw new Error('No auth token');
            const saved = await notificationsApi.updateSettings(changes, token);
            confirmedRef.current = saved;
            // Keep any edits made while this request was in flight.
            setSettings({ ...saved, ...pendingRef.current });
        } catch (error) {
            console.error('[SETTINGS] Failed to save notification settings:', error);
            pendingRef.current = {};
            if (confirmedRef.current) setSettings(confirmedRef.current);
            setToast({ severity: 'error', text: 'השמירה נכשלה, ההגדרה הוחזרה. נסה שוב.' });
        }
    }, []);

    // Flush unsaved edits if the user navigates away mid-debounce.
    useEffect(() => () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            flush();
        }
    }, [flush]);

    const applyChanges = useCallback((changes: NotificationSettingsUpdate) => {
        setSettings(prev => (prev ? { ...prev, ...changes } : prev));
        pendingRef.current = { ...pendingRef.current, ...changes };
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    }, [flush]);

    const snooze = async (hours: number | null) => {
        setSnoozeAnchor(null);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const saved = await notificationsApi.snooze(hours, token);
            confirmedRef.current = saved;
            setSettings(prev => ({ ...saved, ...(prev ? pendingRef.current : {}) }));
            setToast({ severity: 'success', text: hours ? `ההתראות הושהו ל-${hours} שעות` : 'ההתראות חודשו' });
        } catch (error) {
            console.error('[SETTINGS] Failed to snooze:', error);
            setToast({ severity: 'error', text: 'הפעולה נכשלה. נסה שוב.' });
        }
    };

    const unmute = async (mute: NotificationMute) => {
        const key = `${mute.targetType}:${mute.targetId}`;
        setBusyMute(key);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            const mutes = await notificationsApi.unmute(mute.targetType, mute.targetId, token);
            setSettings(prev => (prev ? { ...prev, mutes } : prev));
            if (confirmedRef.current) confirmedRef.current = { ...confirmedRef.current, mutes };
        } catch (error) {
            console.error('[SETTINGS] Failed to unmute:', error);
            setToast({ severity: 'error', text: 'ביטול ההשתקה נכשל. נסה שוב.' });
        } finally {
            setBusyMute(null);
        }
    };

    if (isLoaded && !userId) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }}>
                <Alert severity="warning" sx={{ borderRadius: 3 }}>
                    עליך להתחבר כדי לנהל הגדרות התראות
                </Alert>
            </Container>
        );
    }

    if (loadError) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }}>
                <Alert severity="error" sx={{ borderRadius: 3 }} action={<Button color="inherit" onClick={load}>נסה שוב</Button>}>
                    לא הצלחנו לטעון את הגדרות ההתראות
                </Alert>
            </Container>
        );
    }

    if (!settings) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
                <LoadingMotif id="brand-pulse" label="טוען התראות…" />
            </Container>
        );
    }

    const snoozedUntil = settings.snoozeUntil ? new Date(settings.snoozeUntil) : null;
    const snoozeLabel = snoozedUntil
        ? `מושהות עד ${snoozedUntil.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}${snoozedUntil.toDateString() !== new Date().toDateString() ? ` (${snoozedUntil.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })})` : ''}`
        : null;
    const tz = browserTimezone();

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
            <Typography variant="h4" component="h1" fontWeight={800} mb={1}>
                הגדרות התראות
            </Typography>
            <Typography color="text.secondary" mb={3}>
                השינויים נשמרים אוטומטית.
            </Typography>

            <Stack spacing={2.5}>
                <SectionCard
                    icon={<NotificationsActiveOutlinedIcon />}
                    title="התראות פוש"
                    subtitle="התראות למכשירים ולדפדפנים שלך. ההתראות בתוך האפליקציה לא מושפעות."
                    action={
                        <Switch
                            checked={settings.pushEnabled}
                            onChange={(_, v) => applyChanges({ pushEnabled: v })}
                            inputProps={{ 'aria-label': 'התראות פוש' }}
                        />
                    }
                >
                    <Collapse in={settings.pushEnabled}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mt: 2.5 }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Box sx={{ color: 'text.secondary', display: 'flex' }}><NotificationsPausedOutlinedIcon /></Box>
                                <Box>
                                    <Typography fontWeight={600}>השהיית התראות</Typography>
                                    <Typography variant="body2" color="text.secondary">{snoozeLabel || 'עצור את כל הפוש לזמן קצוב'}</Typography>
                                </Box>
                            </Stack>
                            {snoozedUntil ? (
                                <Button onClick={() => snooze(null)}>חדש עכשיו</Button>
                            ) : (
                                <Button onClick={e => setSnoozeAnchor(e.currentTarget)} aria-haspopup="menu">השהה</Button>
                            )}
                            <Menu anchorEl={snoozeAnchor} open={!!snoozeAnchor} onClose={() => setSnoozeAnchor(null)}>
                                {SNOOZE_HOURS_OPTIONS.map(h => (
                                    <MenuItem key={h} onClick={() => snooze(h)}>{h === 1 ? 'לשעה' : h === 24 ? 'ל-24 שעות' : `ל-${h} שעות`}</MenuItem>
                                ))}
                            </Menu>
                        </Stack>
                    </Collapse>
                </SectionCard>

                <Card elevation={0}>
                    <CardContent sx={{ p: 3 }}>
                        <Typography fontWeight={700} mb={0.5}>על מה לקבל התראה</Typography>
                        <Typography variant="body2" color="text.secondary" mb={2.5}>
                            לכל סוג אפשר לבחור פוש, התראה בתוך האפליקציה, שניהם או אף אחד.
                            ביטול משחק, מקום שהתפנה ותשובה לבקשת הצטרפות תמיד יופיעו באפליקציה.
                        </Typography>
                        <NotificationCategoryMatrix settings={settings} onChange={applyChanges} />
                    </CardContent>
                </Card>

                <SectionCard
                    icon={<BedtimeOutlinedIcon />}
                    title="שעות שקטות"
                    subtitle="בלי פוש בשעות האלה. ההתראות יחכו לך באפליקציה."
                    action={
                        <Switch
                            checked={settings.quietHoursEnabled}
                            onChange={(_, v) => applyChanges(
                                v && tz && tz !== settings.timezone ? { quietHoursEnabled: v, timezone: tz } : { quietHoursEnabled: v }
                            )}
                            inputProps={{ 'aria-label': 'שעות שקטות' }}
                        />
                    }
                >
                    <Collapse in={settings.quietHoursEnabled}>
                        <Stack direction="row" spacing={2} sx={{ mt: 2.5 }}>
                            <TextField
                                type="time"
                                label="מ-"
                                size="small"
                                value={minutesToHHMM(settings.quietHoursStart)}
                                onChange={e => {
                                    const m = HHMMToMinutes(e.target.value);
                                    if (m !== null) applyChanges({ quietHoursStart: m });
                                }}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <TextField
                                type="time"
                                label="עד"
                                size="small"
                                value={minutesToHHMM(settings.quietHoursEnd)}
                                onChange={e => {
                                    const m = HHMMToMinutes(e.target.value);
                                    if (m !== null) applyChanges({ quietHoursEnd: m });
                                }}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                            אזור זמן: {settings.timezone}
                        </Typography>
                    </Collapse>
                </SectionCard>

                <SectionCard icon={<VolumeOffOutlinedIcon />} title="מושתקים" subtitle="אנשים, קבוצות ומשחקים שההתראות מהם מושתקות">
                    <Box sx={{ mt: 2.5 }}>
                        <NotificationMutesList mutes={settings.mutes} busyKey={busyMute} onUnmute={unmute} />
                    </Box>
                </SectionCard>
            </Stack>

            <Snackbar
                open={!!toast}
                autoHideDuration={3500}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {toast ? (
                    <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ borderRadius: 3 }}>
                        {toast.text}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Container>
    );
}
