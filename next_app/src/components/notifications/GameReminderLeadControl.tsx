'use client';
import React, { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';

import {
    GAME_REMINDER_LEAD_DEFAULT,
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

function readLang(): Lang {
    return document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'he';
}

const SAVE_DELAY_MS = 600;

/** Whole non-negative integers only; an empty or fractional box is not a value (null), never silently 0. */
function parseParts(h: string, m: string): number | null {
    if (!/^d+$/.test(h.trim()) || !/^d+$/.test(m.trim())) return null;
    return Number(h) * 60 + Number(m);
}

interface Props {
    /** may be missing/NaN while settings load or from an old server: treated as the default */
    value: number | null | undefined;
    disabled: boolean;
    onChange: (minutes: number) => void;
}

/**
 * Free lead time (5 min – 48 h) with quick-pick chips. Typed values are saved on blur or after a short
 * pause (never per keystroke), and only when valid.
 */
export default function GameReminderLeadControl({ value, disabled, onChange }: Props) {
    // Resolved after mount so server and first client render agree (Hebrew), then switch if needed.
    const [lang, setLang] = useState<Lang>('he');
    useEffect(() => { setLang(readLang()); }, []);
    const t = STRINGS[lang];
    const current = typeof value === 'number' && Number.isFinite(value) ? value : GAME_REMINDER_LEAD_DEFAULT;
    const [hours, setHours] = useState(String(Math.floor(current / 60)));
    const [minutes, setMinutes] = useState(String(current % 60));
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const draftRef = useRef({ hours, minutes, current, onChange });
    draftRef.current = { hours, minutes, current, onChange };

    // Re-sync when the server value changes (load, rollback after a failed save, chip click).
    useEffect(() => {
        setHours(String(Math.floor(current / 60)));
        setMinutes(String(current % 60));
    }, [current]);

    const parts = parseParts(hours, minutes);
    const total = parts ?? 0;
    const invalid = parts === null || !isValidGameReminderLead(parts);

    const commit = (h: string, m: string) => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        const next = parseParts(h, m);
        if (next !== null && isValidGameReminderLead(next) && next !== draftRef.current.current) draftRef.current.onChange(next);
    };

    const scheduleCommit = (h: string, m: string) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => commit(h, m), SAVE_DELAY_MS);
    };

    // Don't lose a pending edit if the user navigates away mid-delay.
    useEffect(() => () => {
        if (timerRef.current) commit(draftRef.current.hours, draftRef.current.minutes);
    }, []);

    return (
        <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, bgcolor: 'action.hover', opacity: disabled ? 0.6 : 1 }}>
            <Typography variant="body2" fontWeight={600} mb={1}>{t.title}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.5}>
                {GAME_REMINDER_LEAD_PRESETS.map(p => (
                    <Chip
                        key={p}
                        label={describeLeadMinutes(p, lang)}
                        disabled={disabled}
                        color={current === p ? 'primary' : 'default'}
                        variant={current === p ? 'filled' : 'outlined'}
                        onMouseDown={e => e.preventDefault() /* keep focus: no blur-commit racing the chip's own save */}
                        onClick={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } onChange(p); }}
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
                    onChange={e => { setHours(e.target.value); scheduleCommit(e.target.value, minutes); }}
                    onBlur={() => commit(hours, minutes)}
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
                    onChange={e => { setMinutes(e.target.value); scheduleCommit(hours, e.target.value); }}
                    onBlur={() => commit(hours, minutes)}
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
