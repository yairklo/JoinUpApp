"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { useTournamentMutations, useTournamentTeams } from "@/hooks/tournaments";
import { CannotStartError, tournamentErrorMessage } from "@/services/api/tournaments";
import { tournamentStatusLabel } from "@/utils/tournament";
import {
    STATUS_ORDER,
    canCancelTournament,
    cancelConfirmMatches,
    describeStartProblem,
    nextStatusAction,
    reopenAction,
    type StatusAction,
} from "@/utils/tournamentManage";
import type { TournamentDetail } from "@/types/tournament";

export interface StatusControlsProps {
    tournament: TournamentDetail;
    /** Organizer / admin: sees "start anyway" (`force`). */
    canForce: boolean;
    /** A schedule exists (hides "reopen registration"). */
    hasSchedule: boolean;
    /** Called after a status change so the page can refetch. */
    onChanged?: () => void;
    onGoToSchedule?: () => void;
    onGoToTeams?: () => void;
}

/** Manage section (c): lifecycle timeline, the next transition and cancel (spec 11.3). */
export default function StatusControls({ tournament: t, canForce, hasSchedule, onChanged, onGoToSchedule, onGoToTeams }: StatusControlsProps) {
    const mut = useTournamentMutations();
    const { teams } = useTournamentTeams(t.id, { live: false });
    const nameById = useMemo(() => new Map(teams.map((x) => [x.id, x.name])), [teams]);
    const [pending, setPending] = useState<StatusAction | null>(null);
    const [problems, setProblems] = useState<unknown[] | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const next = nextStatusAction(t.status);
    const reopen = reopenAction(t.status, hasSchedule, t.registrationClosesAt);
    const currentIdx = STATUS_ORDER.indexOf(t.status);

    const close = () => {
        setPending(null);
        setProblems(null);
        setError(null);
    };

    const apply = async (action: StatusAction, force = false) => {
        setError(null);
        const res = await mut.setStatus(t.id, action.to, force);
        if (res) {
            close();
            setCancelOpen(false);
            setTyped("");
            setToast(`הסטטוס עודכן: ${tournamentStatusLabel(action.to)}`);
            onChanged?.();
        } else if (mut.error instanceof CannotStartError) {
            setProblems(mut.error.problems);
        } else {
            setError(tournamentErrorMessage(mut.error) ?? "לא הצלחנו לעדכן את הסטטוס. נסו שוב.");
        }
    };

    const cancelAction: StatusAction = {
        to: "CANCELLED",
        label: "ביטול הטורניר",
        confirm: "כל המשחקים שלא שוחקו יבוטלו. אי אפשר לבטל את הפעולה.",
    };

    const views = (problems ?? []).map((p) => describeStartProblem(p, t, nameById));

    return (
        <Box data-testid="manage-section-status">
            <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, mb: 2 }} aria-label="שלבי הטורניר">
                {STATUS_ORDER.map((s, i) => {
                    const done = t.status !== "CANCELLED" && i < currentIdx;
                    const current = s === t.status;
                    return (
                        <Stack key={s} component="li" direction="row" spacing={1.5} alignItems="center" aria-current={current ? "step" : undefined} data-testid={`status-step-${s}`} sx={{ minHeight: 44 }}>
                            {done ? <CheckCircleRoundedIcon color="success" fontSize="small" /> : current ? <CheckCircleRoundedIcon color="primary" fontSize="small" /> : <RadioButtonUncheckedRoundedIcon fontSize="small" sx={{ color: "text.disabled" }} />}
                            <Typography variant="body1" fontWeight={current ? 800 : 400} color={current || done ? "text.primary" : "text.secondary"}>
                                {tournamentStatusLabel(s)}
                            </Typography>
                        </Stack>
                    );
                })}
                {t.status === "CANCELLED" && (
                    <Typography variant="body1" fontWeight={800} color="error.main" sx={{ mt: 1 }}>{tournamentStatusLabel("CANCELLED")}</Typography>
                )}
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 3 }}>
                {next && (
                    <Button variant="contained" size="large" onClick={() => setPending(next)} data-testid={`status-action-${next.to}`} sx={{ minHeight: 48 }}>
                        {next.label}
                    </Button>
                )}
                {reopen && (
                    <Button variant="outlined" size="large" onClick={() => setPending(reopen)} data-testid={`status-action-reopen-${reopen.to}`} sx={{ minHeight: 48 }}>
                        {reopen.label}
                    </Button>
                )}
            </Stack>

            {canCancelTournament(t.status) && (
                <Button color="error" onClick={() => setCancelOpen(true)} data-testid="status-action-CANCELLED">
                    ביטול הטורניר
                </Button>
            )}

            <Dialog open={!!pending} onClose={close} dir="rtl" maxWidth="xs" fullWidth data-testid="status-confirm">
                <DialogTitle>{pending?.label}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">{pending?.confirm}</Typography>
                    {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
                    {problems && (
                        <Box sx={{ mt: 1.5 }} data-testid="cannot-start-list">
                            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>אי אפשר להתחיל עדיין:</Typography>
                            <Stack component="ul" spacing={0.75} sx={{ listStyle: "none", m: 0, p: 0 }}>
                                {views.map((v, i) => (
                                    <Stack key={i} component="li" direction="row" spacing={1} alignItems="center">
                                        <CloseRoundedIcon fontSize="small" color="error" aria-hidden />
                                        <Typography variant="body2" sx={{ flex: 1 }}>{v.text}</Typography>
                                        {v.code === "NO_SCHEDULE" && onGoToSchedule && <Button size="small" onClick={() => { close(); onGoToSchedule(); }}>לבניית לוח</Button>}
                                        {(v.code === "TOO_FEW_PLAYERS" || v.code === "TOO_MANY_PLAYERS" || v.code === "TOO_FEW_TEAMS") && onGoToTeams && <Button size="small" onClick={() => { close(); onGoToTeams(); }}>לקבוצות</Button>}
                                    </Stack>
                                ))}
                            </Stack>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={close}>{problems ? "סגירה" : "ביטול"}</Button>
                    {problems ? (
                        canForce && pending && (
                            <Button variant="outlined" color="warning" onClick={() => void apply(pending, true)} disabled={mut.pending} data-testid="status-force">
                                התחלה בכל זאת
                            </Button>
                        )
                    ) : (
                        <Button variant="contained" onClick={() => pending && void apply(pending)} disabled={mut.pending} data-testid="status-confirm-button">
                            אישור
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} dir="rtl" maxWidth="xs" fullWidth data-testid="status-cancel-dialog">
                <DialogTitle>ביטול הטורניר</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 1.5 }}>{cancelAction.confirm}</Typography>
                    <TextField
                        fullWidth
                        size="small"
                        label={`להקלדה: ${t.title}`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        inputProps={{ "data-testid": "status-cancel-input" }}
                    />
                    {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelOpen(false)}>חזרה</Button>
                    <Button color="error" variant="contained" disabled={mut.pending || !cancelConfirmMatches(typed, t.title)} onClick={() => void apply(cancelAction)} data-testid="status-cancel-confirm">
                        ביטול הטורניר
                    </Button>
                </DialogActions>
            </Dialog>
            <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} message={toast ?? ""} />
        </Box>
    );
}
