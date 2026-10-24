"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { displayGroupName, displayStageName } from "@/utils/tournamentViews";
import type { DescribedConflict } from "@/utils/tournamentManage";
import type { TournamentStage } from "@/types/tournament";

export interface MatchEditValues {
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    time: string;
    court: string;
    status: "SCHEDULED" | "POSTPONED" | "CANCELLED";
    stageId: string;
    groupId: string;
    round: string;
}

export const EMPTY_MATCH_VALUES: MatchEditValues = {
    homeTeamId: "",
    awayTeamId: "",
    date: "",
    time: "",
    court: "",
    status: "SCHEDULED",
    stageId: "",
    groupId: "",
    round: "",
};

export interface MatchEditDialogProps {
    open: boolean;
    mode: "add" | "edit";
    number?: number;
    values: MatchEditValues;
    onChange: (next: MatchEditValues) => void;
    teams: Array<{ id: string; name: string }>;
    stages: TournamentStage[];
    courts: string[];
    saving: boolean;
    /** Conflicts returned by the last save attempt; the primary button then offers `force`. */
    conflicts?: DescribedConflict[];
    errorText?: string | null;
    canDelete: boolean;
    onSave: (force: boolean) => void;
    onDelete: () => void;
    onClose: () => void;
}

const STATUS_HE: Record<MatchEditValues["status"], string> = { SCHEDULED: "מתוכנן", POSTPONED: "נדחה", CANCELLED: "בוטל" };

/** Add / edit one match (dialog on desktop, full screen on phones; spec 11.2 "Manual edit"). */
export default function MatchEditDialog(p: MatchEditDialogProps) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
    const [confirmDelete, setConfirmDelete] = useState(false);
    const v = p.values;
    const set = (patch: Partial<MatchEditValues>) => p.onChange({ ...v, ...patch });
    const groups = p.stages.find((s) => s.id === v.stageId)?.groups ?? [];
    const conflicted = (p.conflicts?.length ?? 0) > 0;
    const sel = (label: string, value: string, onChange: (x: string) => void, options: Array<{ value: string; label: string }>, testId: string) => (
        <TextField select fullWidth size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} SelectProps={{ native: true }} inputProps={{ "data-testid": testId }} InputLabelProps={{ shrink: true }}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </TextField>
    );
    const teamOpts = [{ value: "", label: "מקום פנוי" }, ...p.teams.map((t) => ({ value: t.id, label: t.name }))];

    return (
        <Dialog open={p.open} onClose={p.saving ? undefined : p.onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth dir="rtl" data-testid="match-edit-sheet">
            <DialogTitle>{p.mode === "add" ? "הוספת משחק" : `עריכת משחק #${p.number ?? ""}`}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {p.mode === "add" && (
                        <>
                            {sel("שלב", v.stageId, (x) => set({ stageId: x, groupId: "" }), [{ value: "", label: "ללא" }, ...p.stages.map((s) => ({ value: s.id, label: displayStageName(s.name) }))], "match-edit-stage")}
                            {groups.length > 0 && sel("בית", v.groupId, (x) => set({ groupId: x }), [{ value: "", label: "ללא" }, ...groups.map((g) => ({ value: g.id, label: displayGroupName(g.name) }))], "match-edit-group")}
                            <TextField size="small" type="number" label="מחזור" value={v.round} onChange={(e) => set({ round: e.target.value })} inputProps={{ min: 1, inputMode: "numeric", "data-testid": "match-edit-round" }} />
                        </>
                    )}
                    {sel("קבוצה ראשונה", v.homeTeamId, (x) => set({ homeTeamId: x }), teamOpts, "match-edit-home")}
                    {sel("קבוצה שנייה", v.awayTeamId, (x) => set({ awayTeamId: x }), teamOpts, "match-edit-away")}
                    <Stack direction="row" spacing={1}>
                        <TextField size="small" type="date" label="תאריך (שעון ישראל)" value={v.date} onChange={(e) => set({ date: e.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ dir: "ltr", "data-testid": "match-edit-date" }} sx={{ flex: 2 }} />
                        <TextField size="small" type="time" label="שעה" value={v.time} onChange={(e) => set({ time: e.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ dir: "ltr", "data-testid": "match-edit-time" }} sx={{ flex: 1 }} />
                    </Stack>
                    <TextField size="small" label="מגרש" value={v.court} onChange={(e) => set({ court: e.target.value })} inputProps={{ list: "match-edit-courts", maxLength: 30, "data-testid": "match-edit-court" }} />
                    <datalist id="match-edit-courts">{p.courts.map((c) => <option key={c} value={c} />)}</datalist>
                    {p.mode === "edit" && sel("מצב", v.status, (x) => set({ status: x as MatchEditValues["status"] }), (Object.keys(STATUS_HE) as Array<MatchEditValues["status"]>).map((s) => ({ value: s, label: STATUS_HE[s] })), "match-edit-status")}

                    {p.errorText && <Alert severity="error" data-testid="match-edit-error">{p.errorText}</Alert>}
                    {conflicted && (
                        <Alert severity="warning" data-testid="match-edit-conflicts">
                            {p.conflicts!.map((c, i) => (
                                <Box key={i} sx={{ mb: i < p.conflicts!.length - 1 ? 1 : 0 }}>
                                    <Typography variant="body2" fontWeight={700}>{c.title}</Typography>
                                    <Typography variant="body2">{c.body}</Typography>
                                </Box>
                            ))}
                        </Alert>
                    )}
                    {confirmDelete && (
                        <Alert severity="error" action={<Button color="error" size="small" onClick={p.onDelete} disabled={p.saving} data-testid="match-delete-confirm">מחיקה</Button>}>
                            למחוק את המשחק?
                        </Alert>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
                <Box>
                    {p.mode === "edit" && p.canDelete && !confirmDelete && (
                        <Button color="error" onClick={() => setConfirmDelete(true)} disabled={p.saving} data-testid="match-delete">מחיקת משחק</Button>
                    )}
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button onClick={p.onClose} disabled={p.saving}>ביטול</Button>
                    <Button
                        variant="contained"
                        color={conflicted ? "warning" : "primary"}
                        disabled={p.saving}
                        startIcon={p.saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                        onClick={() => p.onSave(conflicted)}
                        data-testid="match-edit-save"
                    >
                        {conflicted ? "שמירה בכל זאת" : "שמירה"}
                    </Button>
                </Stack>
            </DialogActions>
        </Dialog>
    );
}
