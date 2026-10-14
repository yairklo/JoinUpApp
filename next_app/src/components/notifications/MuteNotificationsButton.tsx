'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { MUTE_DURATION_OPTIONS, type NotificationMute, type NotificationMuteTarget } from '@joinup/shared/notificationPrefs';
import { notificationsApi } from '@/services/api/notifications';
import { formatMuteUntil } from './NotificationMutesList';

const DURATION_LABEL = (h: number | null) => (h === null ? 'עד שאבטל' : h === 8 ? 'ל-8 שעות' : h === 168 ? 'לשבוע' : `ל-${h} שעות`);

interface Props {
    targetType: NotificationMuteTarget;
    targetId: string;
    /** e.g. "השתק את דני" */
    muteLabel: string;
    size?: 'small' | 'medium';
}

/** Mute / unmute notifications that originate from a user, group or game. */
export default function MuteNotificationsButton({ targetType, targetId, muteLabel, size = 'medium' }: Props) {
    const { isLoaded, userId, getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

    const [mute, setMute] = useState<NotificationMute | null | undefined>(undefined);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [busy, setBusy] = useState(false);

    const pick = (mutes: NotificationMute[]) =>
        mutes.find(m => m.targetType === targetType && m.targetId === targetId) || null;

    useEffect(() => {
        if (!isLoaded || !userId) return;
        let cancelled = false;
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return;
                const mutes = await notificationsApi.getMutes(token);
                if (!cancelled) setMute(pick(mutes));
            } catch (error) {
                console.error('[MUTE] Failed to load mutes:', error);
                if (!cancelled) setMute(null);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, userId, targetType, targetId]);

    const run = async (fn: (token: string) => Promise<NotificationMute[]>) => {
        setAnchor(null);
        setBusy(true);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            setMute(pick(await fn(token)));
        } catch (error) {
            console.error('[MUTE] Failed to update mute:', error);
        } finally {
            setBusy(false);
        }
    };

    if (!isLoaded || !userId || userId === targetId || mute === undefined) return null;

    if (mute) {
        return (
            <Tooltip title={`מושתק ${formatMuteUntil(mute.until)}`}>
                <span>
                    <Button
                        size={size}
                        variant="outlined"
                        color="inherit"
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <NotificationsActiveOutlinedIcon />}
                        disabled={busy}
                        onClick={() => run(t => notificationsApi.unmute(targetType, targetId, t))}
                    >
                        בטל השתקה
                    </Button>
                </span>
            </Tooltip>
        );
    }

    return (
        <>
            <Button
                size={size}
                variant="outlined"
                color="inherit"
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <NotificationsOffOutlinedIcon />}
                disabled={busy}
                onClick={e => setAnchor(e.currentTarget)}
                aria-haspopup="menu"
            >
                {muteLabel}
            </Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {MUTE_DURATION_OPTIONS.map(h => (
                    <MenuItem key={String(h)} onClick={() => run(t => notificationsApi.mute(targetType, targetId, h, t))}>
                        {DURATION_LABEL(h)}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
