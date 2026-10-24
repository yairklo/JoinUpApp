"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
    MAX_COURTS,
    SCHEDULE_PARAM_ERROR_HE,
    type ScheduleParamError,
    type ScheduleParams,
} from "@/utils/tournamentManage";

export interface ScheduleParamsFormProps {
    params: ScheduleParams;
    onChange: (next: ScheduleParams) => void;
    errors: ScheduleParamError[];
    showErrors: boolean;
    loading: boolean;
    onPreview: () => void;
}

function NumberField({ label, value, onChange, testId, suffix = "דק׳", min = 0 }: { label: string; value: number; onChange: (n: number) => void; testId: string; suffix?: string; min?: number }) {
    return (
        <TextField
            size="small"
            type="number"
            label={label}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10) || 0))}
            inputProps={{ inputMode: "numeric", min, "data-testid": testId }}
            InputProps={{ endAdornment: suffix ? <Typography variant="caption" color="text.secondary">{suffix}</Typography> : undefined }}
            sx={{ flex: 1, minWidth: 110 }}
        />
    );
}

/** Schedule generation parameters, all times Israel wall-clock (spec 11.2). */
export default function ScheduleParamsForm({ params: p, onChange, errors, showErrors, loading, onPreview }: ScheduleParamsFormProps) {
    const [advanced, setAdvanced] = useState(false);
    const [draftCourt, setDraftCourt] = useState("");
    const set = (patch: Partial<ScheduleParams>) => onChange({ ...p, ...patch });
    const dayErr = (i: number) => (showErrors ? errors.find((e) => "index" in e && e.index === i) : undefined);
    const topErrors = showErrors ? errors.filter((e) => !("index" in e)) : [];

    const addCourt = () => {
        const name = draftCourt.trim();
        if (!name || p.courtNames.includes(name)) return;
        set({ courtNames: [...p.courtNames, name] });
        setDraftCourt("");
    };

    return (
        <Stack spacing={2} data-testid="schedule-params">
            <Box>
                <Typography variant="subtitle2" fontWeight={800}>ימים ושעות</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    חלונות הזמן הם בשעון ישראל, כולל מעבר שעון קיץ/חורף.
                </Typography>
                <Stack spacing={1}>
                    {p.days.map((d, i) => {
                        const err = dayErr(i);
                        return (
                            <Box key={i}>
                                <Stack direction="row" spacing={1} alignItems="center" data-testid={`schedule-param-day-${i}`}>
                                    <TextField
                                        size="small"
                                        type="date"
                                        value={d.date}
                                        error={!!err}
                                        onChange={(e) => set({ days: p.days.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })}
                                        inputProps={{ "aria-label": "תאריך", dir: "ltr" }}
                                        sx={{ flex: 2, minWidth: 130 }}
                                    />
                                    <TextField
                                        size="small"
                                        type="time"
                                        value={d.from}
                                        error={!!err}
                                        onChange={(e) => set({ days: p.days.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })}
                                        inputProps={{ "aria-label": "משעה", dir: "ltr" }}
                                        sx={{ flex: 1, minWidth: 96 }}
                                    />
                                    <TextField
                                        size="small"
                                        type="time"
                                        value={d.to}
                                        error={!!err}
                                        onChange={(e) => set({ days: p.days.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })}
                                        inputProps={{ "aria-label": "עד שעה", dir: "ltr" }}
                                        sx={{ flex: 1, minWidth: 96 }}
                                    />
                                    <IconButton aria-label="הסרת יום" onClick={() => set({ days: p.days.filter((_, j) => j !== i) })} sx={{ width: 44, height: 44 }}>
                                        <CloseRoundedIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                                {err && <Typography variant="caption" color="error.main">{SCHEDULE_PARAM_ERROR_HE[err.code]}</Typography>}
                            </Box>
                        );
                    })}
                </Stack>
                <Button
                    size="small"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => set({ days: [...p.days, { date: "", from: p.days.at(-1)?.from ?? "16:00", to: p.days.at(-1)?.to ?? "22:00" }] })}
                    sx={{ mt: 0.5 }}
                    data-testid="schedule-param-add-day"
                >
                    הוספת יום
                </Button>
                {topErrors.filter((e) => e.code === "NO_DAYS").map((e) => (
                    <Typography key={e.code} variant="caption" color="error.main" display="block">{SCHEDULE_PARAM_ERROR_HE[e.code]}</Typography>
                ))}
            </Box>

            <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2" fontWeight={800}>מגרשים</Typography>
                    <FormControlLabel
                        control={<Switch size="small" checked={p.namedCourts} onChange={(e) => set({ namedCourts: e.target.checked })} />}
                        label={<Typography variant="caption">מתן שמות למגרשים</Typography>}
                    />
                </Stack>
                {p.namedCourts ? (
                    <Box>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                            {p.courtNames.map((n) => (
                                <Chip key={n} label={n} onDelete={() => set({ courtNames: p.courtNames.filter((x) => x !== n) })} />
                            ))}
                        </Stack>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                size="small"
                                value={draftCourt}
                                placeholder="מגרש צפוני"
                                onChange={(e) => setDraftCourt(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCourt())}
                                inputProps={{ "aria-label": "שם מגרש", maxLength: 30 }}
                                sx={{ flex: 1 }}
                            />
                            <Button variant="outlined" onClick={addCourt}>הוספה</Button>
                        </Stack>
                    </Box>
                ) : (
                    <NumberField label="מספר מגרשים" value={p.courtCount} onChange={(n) => set({ courtCount: Math.min(MAX_COURTS, n) })} testId="schedule-param-courts" suffix="" min={1} />
                )}
                {showErrors && errors.some((e) => e.code === "COURTS" || e.code === "COURT_NAMES") && (
                    <Typography variant="caption" color="error.main" display="block">
                        {SCHEDULE_PARAM_ERROR_HE[errors.find((e) => e.code === "COURTS" || e.code === "COURT_NAMES")!.code]}
                    </Typography>
                )}
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <NumberField label="משך משחק" value={p.matchMinutes} onChange={(n) => set({ matchMinutes: n })} testId="schedule-param-match-minutes" min={1} />
                <NumberField label="הפסקה" value={p.breakMinutes} onChange={(n) => set({ breakMinutes: n })} testId="schedule-param-break-minutes" />
                <NumberField label="מנוחה מינימלית" value={p.minRestMinutes} onChange={(n) => set({ minRestMinutes: n })} testId="schedule-param-rest-minutes" />
            </Stack>
            {showErrors && errors.some((e) => e.code === "MINUTES") && (
                <Typography variant="caption" color="error.main">{SCHEDULE_PARAM_ERROR_HE.MINUTES}</Typography>
            )}

            <Box>
                <Button size="small" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>{advanced ? "▾ מתקדם" : "▸ מתקדם"}</Button>
                <Collapse in={advanced}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                        <NumberField label="רזולוציית זמן" value={p.stepMinutes ?? 0} onChange={(n) => set({ stepMinutes: n || undefined })} testId="schedule-param-step" min={0} />
                        <Button variant="outlined" onClick={() => set({ seed: Math.floor(Math.random() * 1e9) })} data-testid="schedule-param-reseed">
                            הגרלה חדשה
                        </Button>
                    </Stack>
                </Collapse>
            </Box>

            <Button
                variant="contained"
                size="large"
                onClick={onPreview}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
                data-testid="schedule-preview"
                sx={{ minHeight: 52 }}
            >
                תצוגה מקדימה
            </Button>
        </Stack>
    );
}
