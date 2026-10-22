"use client";

import { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { getSportTheme } from "@/utils/sports";
import type { TournamentSport } from "@/types/tournament";
import type { StepProps } from "./stepTypes";
import { SPORT_DEFAULTS } from "./wizardModel";

export const SPORT_TILES: { sport: TournamentSport; emoji: string; label: string }[] = [
    { sport: "SOCCER", emoji: "⚽", label: "כדורגל" },
    { sport: "BASKETBALL", emoji: "🏀", label: "כדורסל" },
    { sport: "TENNIS", emoji: "🎾", label: "טניס" },
];

export interface FieldOption {
    id: string;
    name: string;
}

export interface StepBasicsProps extends StepProps {
    /** Resolves field matches for a query; omitted = free-text location only. */
    onSearchFields?: (q: string) => Promise<FieldOption[]>;
}

export default function StepBasics({ values: v, errors, onChange, disabled, locked, onSearchFields }: StepBasicsProps) {
    const [q, setQ] = useState("");
    const [options, setOptions] = useState<FieldOption[]>([]);

    useEffect(() => {
        if (!onSearchFields || q.trim().length < 2) {
            setOptions([]);
            return;
        }
        let live = true;
        const h = setTimeout(() => {
            onSearchFields(q.trim())
                .then((r) => live && setOptions(r))
                .catch(() => live && setOptions([]));
        }, 250);
        return () => {
            live = false;
            clearTimeout(h);
        };
    }, [q, onSearchFields]);

    const pickSport = (sport: TournamentSport) => {
        if (sport === v.sport) return;
        const d = SPORT_DEFAULTS[sport];
        onChange({
            sport,
            startersPerTeam: d.starters,
            minPlayersPerTeam: d.min,
            maxPlayersPerTeam: d.max,
            matchMinutes: d.matchMinutes,
        });
    };

    return (
        <Stack spacing={2.75} data-testid="wizard-step-1">
            <TextField
                label="שם הטורניר"
                value={v.title}
                disabled={disabled}
                required
                onChange={(e) => onChange({ title: e.target.value })}
                error={!!errors.title}
                helperText={errors.title ?? `${v.title.length}/80`}
                slotProps={{
                    htmlInput: { maxLength: 120, "data-testid": "wizard-title" },
                    formHelperText: { ...({ "data-testid": "wizard-error-title" } as object) },
                }}
                fullWidth
            />

            <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: "block", mb: 1 }}>
                    ענף ספורט
                </Typography>
                <Box role="radiogroup" aria-label="סוג ספורט" sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 }}>
                    {SPORT_TILES.map((t) => {
                        const selected = v.sport === t.sport;
                        const st = getSportTheme(t.sport);
                        return (
                            <ButtonBase
                                key={t.sport}
                                role="radio"
                                aria-checked={selected}
                                disabled={disabled || locked}
                                data-testid={`wizard-sport-${t.sport}`}
                                onClick={() => pickSport(t.sport)}
                                sx={(theme) => ({
                                    height: 84,
                                    borderRadius: 2.5,
                                    border: "2px solid",
                                    borderColor: selected ? st.base : "divider",
                                    bgcolor: selected
                                        ? alpha(st.base, theme.palette.mode === "dark" ? 0.18 : 0.1)
                                        : alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.025 : 0.015),
                                    boxShadow: selected ? `0 4px 14px ${alpha(st.base, 0.22)}` : "none",
                                    flexDirection: "column",
                                    gap: 0.5,
                                    transition: "all 0.15s ease",
                                    "&:hover": {
                                        borderColor: selected ? st.base : alpha(st.base, 0.5),
                                    },
                                })}
                            >
                                <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>{t.emoji}</span>
                                <Typography variant="body2" fontWeight={selected ? 800 : 600}>
                                    {t.label}
                                </Typography>
                            </ButtonBase>
                        );
                    })}
                </Box>
            </Box>

            <TextField
                label="תיאור"
                value={v.description}
                disabled={disabled}
                multiline
                minRows={3}
                onChange={(e) => onChange({ description: e.target.value })}
                error={!!errors.description}
                helperText={errors.description ?? `${v.description.length}/2000`}
                slotProps={{ htmlInput: { maxLength: 2100 } }}
                fullWidth
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                    label="התחלה"
                    type="datetime-local"
                    value={v.startsAt}
                    disabled={disabled}
                    required
                    onChange={(e) => onChange({ startsAt: e.target.value })}
                    error={!!errors.startsAt}
                    helperText={errors.startsAt}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { "data-testid": "wizard-starts-at" } }}
                    fullWidth
                />
                <TextField
                    label="סיום (אופציונלי)"
                    type="datetime-local"
                    value={v.endsAt}
                    disabled={disabled}
                    onChange={(e) => onChange({ endsAt: e.target.value })}
                    error={!!errors.endsAt}
                    helperText={errors.endsAt}
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                />
            </Stack>

            {onSearchFields && (
                <Autocomplete
                    options={options}
                    getOptionLabel={(o) => o.name}
                    filterOptions={(x) => x}
                    value={v.fieldId ? { id: v.fieldId, name: v.fieldName || v.fieldId } : null}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    onInputChange={(_, val, reason) => reason === "input" && setQ(val)}
                    onChange={(_, o) => onChange({ fieldId: o?.id ?? "", fieldName: o?.name ?? "", customLocation: o ? "" : v.customLocation })}
                    disabled={disabled}
                    noOptionsText="לא נמצאו מגרשים"
                    renderInput={(p) => <TextField {...p} label="מגרש" />}
                />
            )}
            {!v.fieldId && (
                <TextField
                    label="מיקום אחר"
                    value={v.customLocation}
                    disabled={disabled}
                    onChange={(e) => onChange({ customLocation: e.target.value })}
                    fullWidth
                />
            )}

            <Box
                sx={(theme) => ({
                    p: 2,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.03 : 0.015),
                })}
            >
                <FormControlLabel
                    control={<Switch checked={v.isPublic} disabled={disabled} onChange={(e) => onChange({ isPublic: e.target.checked })} />}
                    label={<Typography variant="body2" fontWeight={700}>טורניר ציבורי</Typography>}
                    sx={{ mx: 0 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    טורניר ציבורי מופיע ברשימת הטורנירים. טורניר פרטי נגיש רק בקישור.
                </Typography>
            </Box>

            <Typography
                variant="body2"
                color="text.secondary"
                data-testid="wizard-minors-info"
                sx={(theme) => ({
                    p: 1.5,
                    px: 2,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.info.main, 0.08),
                    border: "1px solid",
                    borderColor: alpha(theme.palette.info.main, 0.2),
                    fontWeight: 500,
                })}
            >
                בשלב זה הטורניר פתוח לבני 18 ומעלה בלבד.
            </Typography>
        </Stack>
    );
}
