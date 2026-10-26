'use client';
import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';

import {
    GAME_REMINDER_LEAD_MAX,
    GAME_REMINDER_LEAD_STEP,
    GAME_REMINDER_LEAD_PRESETS,
    isValidGameReminderLead,
    describeLeadMinutes,
} from '@joinup/shared/notificationPrefs';

type Lang = 'he' | 'en';

const STRINGS: Record<Lang, {
    title: string; hours: string; minutes: string; error: string; chosen: (words: string) => string;
}> = {
    he: {
        title: 'מתי לקבל תזכורת לפני משחק',
        hours: 'שעות',
        minutes: 'דקות',
        error: 'אפשר לבחור בין 5 דקות ל-48 שעות, במרווחים של 5 דקות',
        chosen: words => `התזכורת תגיע ${words} לפני המשחק`,
    },
    en: {
        title: 'When to get a reminder before a game',
        hours: 'Hours',
        minutes: 'Minutes',
        error: 'Choose between 5 minutes and 48 hours, in 5-minute steps',
        chosen: words => `You will be reminded ${words} before the game`,
    },
};

function currentLang(): Lang {
    if (typeof document !== 'undefined' && document.documentElement.lang?.toLowerCase().startsWith('en')) return 'en';
    return 'he';
}

interface Props {
    value: number;
    disabled: boolean;
    onChange: (minutes: number) => void;
}

/** Free lead time (5 min – 48 h) with quick-pick chips. Saves only valid values. */
export default function GameReminderLeadControl({ value, disabled, onChange }: Props) {
    const lang = currentLang();
    const t = STRINGS[lang];
    const [hours, setHours] = useState(String(Math.floor(value / 60)));
    const [minutes, setMinutes] = useState(String(value % 60));

    // Re-sync when the server value changes (load, rollback after a failed save, chip click).
    useEffect(() => {
        setHours(String(Math.floor(value / 60)));
        setMinutes(String(value % 60));
    }, [value]);

    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    const invalid = !isValidGameReminderLead(total);

    const edit = (h: string, m: string) => {
        const next = (Number(h) || 0) * 60 + (Number(m) || 0);
        if (isValidGameReminderLead(next)) onChange(next);
    };

    return (
        <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: 'action.hover', opacity: disabled ? 0.6 : 1 }}>
            <Typography variant="body2" fontWeight={600} mb={1}>{t.title}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
                {GAME_REMINDER_LEAD_PRESETS.map(p => (
                    <Chip
                        key={p}
                        label={describeLeadMinutes(p, lang)}
                        disabled={disabled}
                        color={value === p ? 'primary' : 'default'}
                        variant={value === p ? 'filled' : 'outlined'}
                        onClick={() => onChange(p)}
                    />
                ))}
            </Stack>
            <Stack direction="row" spacing={1.5}>
                <TextField
                    type="number"
                    size="small"
                    label={t.hours}
                    value={hours}
                    disabled={disabled}
                    error={invalid}
                    onChange={e => { setHours(e.target.value); edit(e.target.value, minutes); }}
                    inputProps={{ min: 0, max: GAME_REMINDER_LEAD_MAX / 60, step: 1, inputMode: 'numeric' }}
                    fullWidth
                />
                <TextField
                    type="number"
                    size="small"
                    label={t.minutes}
                    value={minutes}
                    disabled={disabled}
                    error={invalid}
                    onChange={e => { setMinutes(e.target.value); edit(hours, e.target.value); }}
                    inputProps={{ min: 0, max: 55, step: GAME_REMINDER_LEAD_STEP, inputMode: 'numeric' }}
                    fullWidth
                />
            </Stack>
            <Typography
                variant="caption"
                display="block"
                mt={1}
                color={invalid ? 'error' : 'text.secondary'}
                role={invalid ? 'alert' : undefined}
            >
                {invalid
                    ? t.error
                    : t.chosen(describeLeadMinutes(total, lang))}
            </Typography>
        </Box>
    );
}
