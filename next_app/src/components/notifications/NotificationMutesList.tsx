'use client';
import React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
import type { NotificationMute } from '@joinup/shared/notificationPrefs';

const TYPE_LABEL: Record<NotificationMute['targetType'], string> = {
    USER: 'משתמש',
    SERIES: 'קבוצה',
    GAME: 'משחק',
};

export function formatMuteUntil(until: string | null): string {
    if (!until) return 'עד שתבטל';
    const d = new Date(until);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `עד ${time}` : `עד ${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} ${time}`;
}

interface Props {
    mutes: NotificationMute[];
    busyKey?: string | null;
    onUnmute: (mute: NotificationMute) => void;
}

export default function NotificationMutesList({ mutes, busyKey, onUnmute }: Props) {
    if (mutes.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary">
                אין השתקות. אפשר להשתיק חבר מהפרופיל שלו, או קבוצה מעמוד הקבוצה.
            </Typography>
        );
    }

    return (
        <Stack spacing={1.5}>
            {mutes.map(m => {
                const key = `${m.targetType}:${m.targetId}`;
                const icon = m.targetType === 'USER'
                    ? <PersonOutlineIcon fontSize="small" />
                    : m.targetType === 'SERIES' ? <GroupsOutlinedIcon fontSize="small" /> : <SportsSoccerOutlinedIcon fontSize="small" />;
                return (
                    <Stack key={key} direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <Avatar src={m.imageUrl || undefined} sx={{ width: 36, height: 36 }}>{icon}</Avatar>
                            <Stack sx={{ minWidth: 0 }}>
                                <Typography fontWeight={600} noWrap>{m.label || TYPE_LABEL[m.targetType]}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {TYPE_LABEL[m.targetType]} · {formatMuteUntil(m.until)}
                                </Typography>
                            </Stack>
                        </Stack>
                        <Button size="small" onClick={() => onUnmute(m)} disabled={busyKey === key}>
                            בטל השתקה
                        </Button>
                    </Stack>
                );
            })}
        </Stack>
    );
}
