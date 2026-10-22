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
        <Stack spacing={2.5} data-testid="wizard-step-1">
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

            <Box role="radiogroup" aria-label="סוג ספורט" sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
                {SPORT_TILES.map((t) => {
                    const selected = v.sport === t.sport;
                    return (
                        <ButtonBase
                            key={t.sport}
                            role="radio"
                            aria-checked={selected}
                            disabled={disabled || locked}
                            data-testid={`wizard-sport-${t.sport}`}
                            onClick={() => pickSport(t.sport)}
                            sx={{
                                height: 72,
                                borderRadius: 2,
                                border: 2,
                                borderColor: selected ? "primary.main" : "divider",
                                bgcolor: selected ? "action.selected" : "transparent",
                                flexDirection: "column",
                                gap: 0.25,
                            }}
                        >
                            <span aria-hidden style={{ fontSize: 24 }}>{t.emoji}</span>
                            <Typography variant="body2" fontWeight={selected ? 700 : 500}>{t.label}</Typography>
                        </ButtonBase>
                    );
                })}
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

            <Box>
                <FormControlLabel
                    control={<Switch checked={v.isPublic} disabled={disabled} onChange={(e) => onChange({ isPublic: e.target.checked })} />}
                    label="טורניר ציבורי"
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    טורניר ציבורי מופיע ברשימת הטורנירים. טורניר פרטי נגיש רק בקישור.
                </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" data-testid="wizard-minors-info">
                בשלב זה הטורניר פתוח לבני 18 ומעלה בלבד.
            </Typography>
        </Stack>
    );
}
