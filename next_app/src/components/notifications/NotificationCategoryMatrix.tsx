'use client';
import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';

import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
import DirectionsRunOutlinedIcon from '@mui/icons-material/DirectionsRunOutlined';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import TuneIcon from '@mui/icons-material/Tune';

import {
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CATEGORY_GROUPS,
    type NotificationCategoryKey,
    type NotificationCategoryGroup,
    type NotificationSettings,
    type NotificationSettingsUpdate,
    type NotificationSport,
} from '@joinup/shared/notificationPrefs';
import { CITY_ALIASES } from '@joinup/shared/cityAliases';
import { SPORT_MAPPING } from '@/utils/sports';

const GROUP_TITLES: Record<NotificationCategoryGroup, string> = {
    social: 'חברים והודעות',
    myGames: 'המשחקים והקבוצות שלי',
    discovery: 'גילוי משחקים',
};

const CATEGORY_COPY: Record<NotificationCategoryKey, { title: string; subtitle: string; icon: React.ReactNode }> = {
    friendRequests: { title: 'בקשות חברות', subtitle: 'בקשה חדשה, ואישור של בקשה ששלחת', icon: <PeopleAltOutlinedIcon /> },
    messages: { title: 'הודעות צ׳אט', subtitle: 'הודעה חדשה בצ׳אט (פוש בלבד)', icon: <ChatBubbleOutlineIcon /> },
    friendGames: { title: 'חבר פתח משחק', subtitle: 'כשחבר שלך יוצר משחק חדש', icon: <SportsSoccerOutlinedIcon /> },
    friendJoins: { title: 'חבר הצטרף למשחק', subtitle: 'כשחבר נרשם למשחק שאתה לא בו', icon: <DirectionsRunOutlinedIcon /> },
    gameReminders: { title: 'תזכורות למשחק', subtitle: 'שעה לפני משחק שנרשמת אליו', icon: <AlarmOutlinedIcon /> },
    myGames: { title: 'עדכונים במשחקים שלי', subtitle: 'שינויים, אישור/דחייה, מקום שהתפנה', icon: <EventNoteOutlinedIcon /> },
    invitations: { title: 'הזמנות למשחק', subtitle: 'כשמישהו מוסיף אותך למשחק', icon: <MailOutlineIcon /> },
    organizer: { title: 'בקשות הצטרפות', subtitle: 'למשחקים שאתה מארגן', icon: <AdminPanelSettingsOutlinedIcon /> },
    groupGames: { title: 'משחקים בקבוצות שלי', subtitle: 'משחק חדש בקבוצה שאתה חבר בה', icon: <GroupsOutlinedIcon /> },
    cityGames: { title: 'משחקים חדשים באזור', subtitle: 'משחקים פתוחים שנפתחו בעיר שלך', icon: <LocationCityOutlinedIcon /> },
};

const SPORT_KEYS = Object.keys(SPORT_MAPPING) as NotificationSport[];
const CITY_OPTIONS = Array.from(new Set(Object.values(CITY_ALIASES))).sort((a, b) => a.localeCompare(b, 'he'));

interface Props {
    settings: NotificationSettings;
    onChange: (changes: NotificationSettingsUpdate) => void;
}

function ChannelSwitch({ label, checked, disabled, onToggle }: {
    label: string; checked: boolean; disabled?: boolean; onToggle: (v: boolean) => void;
}) {
    return (
        <Stack alignItems="center" sx={{ minWidth: 56 }}>
            <Switch
                size="small"
                checked={checked && !disabled}
                disabled={disabled}
                onChange={(_, v) => onToggle(v)}
                inputProps={{ 'aria-label': label }}
            />
        </Stack>
    );
}

export default function NotificationCategoryMatrix({ settings, onChange }: Props) {
    const [cityOpen, setCityOpen] = useState(false);
    const pushOff = !settings.pushEnabled;

    const grouped = useMemo(() => NOTIFICATION_CATEGORY_GROUPS.map(group => ({
        group,
        items: NOTIFICATION_CATEGORIES.filter(c => c.group === group),
    })), []);

    const toggleSport = (sport: NotificationSport) => {
        const current = settings.cityGamesSports;
        const next = current.includes(sport) ? current.filter(s => s !== sport) : [...current, sport];
        // Selecting every sport is the same as "all" — store it as the empty list.
        onChange({ cityGamesSports: next.length === SPORT_KEYS.length ? [] : next });
    };

    return (
        <Stack spacing={3}>
            {grouped.map(({ group, items }) => (
                <Box key={group}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                        <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>
                            {GROUP_TITLES[group]}
                        </Typography>
                        <Stack direction="row">
                            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: 'center' }}>פוש</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: 'center' }}>באפליקציה</Typography>
                        </Stack>
                    </Stack>
                    <Stack spacing={1.5} divider={<Divider flexItem />}>
                        {items.map(cat => {
                            const copy = CATEGORY_COPY[cat.key];
                            const isCity = cat.key === 'cityGames';
                            return (
                                <Box key={cat.key}>
                                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                                            <Box sx={{ color: 'text.secondary', display: 'flex' }}>{copy.icon}</Box>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography fontWeight={600}>{copy.title}</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {isCity && settings.cityGamesDigest && settings.cityGamesPush
                                                        ? `סיכום יומי בשעה ${String(settings.digestHour).padStart(2, '0')}:00`
                                                        : copy.subtitle}
                                                </Typography>
                                                {isCity && (
                                                    <Button
                                                        size="small"
                                                        startIcon={<TuneIcon fontSize="small" />}
                                                        onClick={() => setCityOpen(o => !o)}
                                                        aria-expanded={cityOpen}
                                                        sx={{ px: 0.5, mt: 0.25 }}
                                                    >
                                                        {cityOpen ? 'סגור סינון' : 'סינון לפי עיר וענף'}
                                                    </Button>
                                                )}
                                            </Box>
                                        </Stack>
                                        <Stack direction="row" flexShrink={0}>
                                            <ChannelSwitch
                                                label={`${copy.title} — פוש`}
                                                checked={!!settings[cat.pushField]}
                                                disabled={pushOff}
                                                onToggle={v => onChange({ [cat.pushField]: v })}
                                            />
                                            {cat.inAppField ? (
                                                <ChannelSwitch
                                                    label={`${copy.title} — באפליקציה`}
                                                    checked={!!settings[cat.inAppField]}
                                                    onToggle={v => onChange({ [cat.inAppField as string]: v })}
                                                />
                                            ) : (
                                                <Box sx={{ minWidth: 56 }} />
                                            )}
                                        </Stack>
                                    </Stack>

                                    {isCity && (
                                        <Collapse in={cityOpen} unmountOnExit>
                                            <Stack spacing={2} sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600} mb={1}>ענפים</Typography>
                                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                        <Chip
                                                            label="הכול"
                                                            color={settings.cityGamesSports.length === 0 ? 'primary' : 'default'}
                                                            onClick={() => onChange({ cityGamesSports: [] })}
                                                        />
                                                        {SPORT_KEYS.map(sport => (
                                                            <Chip
                                                                key={sport}
                                                                label={SPORT_MAPPING[sport as keyof typeof SPORT_MAPPING]}
                                                                color={settings.cityGamesSports.includes(sport) ? 'primary' : 'default'}
                                                                variant={settings.cityGamesSports.includes(sport) ? 'filled' : 'outlined'}
                                                                onClick={() => toggleSport(sport)}
                                                            />
                                                        ))}
                                                    </Stack>
                                                </Box>

                                                <Box>
                                                    <Typography variant="body2" fontWeight={600} mb={1}>ערים</Typography>
                                                    <Autocomplete
                                                        multiple
                                                        freeSolo
                                                        options={CITY_OPTIONS}
                                                        value={settings.cityGamesCities}
                                                        onChange={(_, value) => onChange({ cityGamesCities: (value as string[]).slice(0, 10) })}
                                                        renderInput={params => (
                                                            <TextField
                                                                {...params}
                                                                size="small"
                                                                placeholder={settings.cityGamesCities.length ? '' : 'העיר שבפרופיל שלך'}
                                                                helperText="ריק = העיר שבפרופיל. אפשר לבחור עד 10 ערים."
                                                            />
                                                        )}
                                                    />
                                                </Box>

                                                <Box>
                                                    <Typography variant="body2" fontWeight={600} mb={1}>תדירות הפוש</Typography>
                                                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                                        <ToggleButtonGroup
                                                            size="small"
                                                            exclusive
                                                            value={settings.cityGamesDigest ? 'digest' : 'instant'}
                                                            onChange={(_, v) => v && onChange({ cityGamesDigest: v === 'digest' })}
                                                        >
                                                            <ToggleButton value="instant">על כל משחק</ToggleButton>
                                                            <ToggleButton value="digest">סיכום יומי</ToggleButton>
                                                        </ToggleButtonGroup>
                                                        {settings.cityGamesDigest && (
                                                            <TextField
                                                                select
                                                                size="small"
                                                                label="שעה"
                                                                value={settings.digestHour}
                                                                onChange={e => onChange({ digestHour: Number(e.target.value) })}
                                                                sx={{ minWidth: 110 }}
                                                            >
                                                                {Array.from({ length: 24 }, (_, h) => (
                                                                    <MenuItem key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</MenuItem>
                                                                ))}
                                                            </TextField>
                                                        )}
                                                    </Stack>
                                                    {!settings.cityGamesPush && (
                                                        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                                                            הפוש לקטגוריה הזו כבוי — הסינון חל גם על ההתראות באפליקציה.
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Stack>
                                        </Collapse>
                                    )}
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>
            ))}
        </Stack>
    );
}
