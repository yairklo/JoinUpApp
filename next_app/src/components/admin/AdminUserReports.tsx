"use client";

import { useState } from "react";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import LoadingMotif from "@/components/motion/LoadingMotif";
import { useAdminUserReports } from "@/hooks/useAdminUserReports";
import {
    RESOLUTION_MAX,
    type AdminUserReport,
    type AdminUserReportPerson,
    type UserReportReason,
    type UserReportResolveAction,
    type UserReportStatus,
} from "@/types/matchResult";

const REASON_LABELS: Record<UserReportReason, string> = {
    HARASSMENT: "הטרדה או בריונות",
    VIOLENCE: "אלימות או איומים",
    CHEATING: "רמאות במשחק",
    NO_SHOW: "לא הגיע למשחק",
    FAKE_PROFILE: "פרופיל מזויף",
    INAPPROPRIATE_CONTENT: "תוכן לא הולם",
    RESULT_DISPUTE: "ערעור על תוצאה",
    OTHER: "אחר",
};

const STATUS_LABELS: Record<UserReportStatus, string> = { OPEN: "פתוח", RESOLVED: "טופל", DISMISSED: "נדחה" };
const FILTERS: Array<{ value: UserReportStatus; label: string }> = [
    { value: "OPEN", label: "פתוחים" },
    { value: "RESOLVED", label: "טופלו" },
    { value: "DISMISSED", label: "נדחו" },
];

function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

function PersonLink({ label, person, bold }: { label: string; person: AdminUserReportPerson; bold?: boolean }) {
    const name = person.name || "משתמש לא ידוע";
    return (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Avatar src={person.imageUrl || undefined} alt={name} sx={{ width: 22, height: 22, fontSize: 12 }}>
                {name.charAt(0)}
            </Avatar>
            <Typography
                component={NextLink}
                href={`/users/${person.id}`}
                target="_blank"
                variant="body2"
                fontWeight={bold ? 800 : 700}
                color="primary"
                noWrap
                title={name}
                sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
            >
                {name}
            </Typography>
        </Stack>
    );
}

type PendingAction = { report: AdminUserReport; action: UserReportResolveAction } | null;

/** Admin queue of player reports (design spec 9.1). Resolve / dismiss / resolve + ban. */
export default function AdminUserReports() {
    const [status, setStatus] = useState<UserReportStatus>("OPEN");
    const { reports, loading, error, busyId, reload, resolve, dismiss } = useAdminUserReports(status);
    const [pending, setPending] = useState<PendingAction>(null);
    const [note, setNote] = useState("");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [toast, setToast] = useState<string | null>(null);

    const closeDialog = () => {
        setPending(null);
        setNote("");
    };

    const confirm = async () => {
        if (!pending) return;
        const { report, action } = pending;
        const resolution = note.trim() || (action === "BAN" ? "המשתמש הושעה" : "טופל");
        const ok = await resolve(report.id, resolution, action);
        closeDialog();
        if (ok) setToast(action === "BAN" ? "המשתמש הושעה והדיווח סומן כטופל" : "הדיווח סומן כטופל");
    };

    const onDismiss = async (id: string) => {
        if (await dismiss(id)) setToast("הדיווח נדחה");
    };

    const targetName = pending?.report.target.name || "המשתמש";

    return (
        <Stack spacing={2} data-testid="admin-user-reports">
            <Typography variant="h5" fontWeight={800}>דיווחים על שחקנים</Typography>

            <ToggleButtonGroup
                size="small"
                exclusive
                value={status}
                onChange={(_, v: UserReportStatus | null) => v && setStatus(v)}
                aria-label="סינון לפי סטטוס"
            >
                {FILTERS.map((f) => (
                    <ToggleButton key={f.value} value={f.value} data-testid={`admin-user-reports-filter-${f.value}`}>
                        {f.label}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            {error && (
                <Alert severity="error" action={<Button color="inherit" size="small" onClick={reload}>נסו שוב</Button>}>
                    {error}
                </Alert>
            )}

            {loading ? (
                <Box display="flex" justifyContent="center" py={6}><LoadingMotif id="brand-pulse" label="טוען…" /></Box>
            ) : reports.length === 0 ? (
                <Alert severity={status === "OPEN" ? "success" : "info"}>
                    {status === "OPEN" ? "אין דיווחים פתוחים." : "אין דיווחים בסטטוס הזה."}
                </Alert>
            ) : (
                reports.map((r) => {
                    const isDispute = r.reason === "RESULT_DISPUTE";
                    const open = expanded[r.id];
                    const gameWhen = r.game?.start ? formatWhen(r.game.start) : "";
                    const gameLabel = [r.game?.field?.name, gameWhen].filter(Boolean).join(" · ") || "משחק";
                    return (
                        <Card key={r.id} data-testid={`admin-user-report-${r.id}`}>
                            <CardContent>
                                <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                        size="small"
                                        label={STATUS_LABELS[r.status]}
                                        color={r.status === "RESOLVED" ? "success" : "default"}
                                        variant={r.status === "DISMISSED" ? "outlined" : "filled"}
                                    />
                                    <Chip size="small" color={isDispute ? "info" : "warning"} label={REASON_LABELS[r.reason] || r.reason} />
                                    <Typography variant="caption" color="text.secondary" sx={{ marginInlineStart: "auto" }}>
                                        {formatWhen(r.createdAt)}
                                    </Typography>
                                </Stack>
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.5, sm: 3 }} mb={1}>
                                    <PersonLink label="דווח על ידי:" person={r.reporter} />
                                    <PersonLink label="על:" person={r.target} bold />
                                </Stack>
                                {r.game && (
                                    <Typography variant="body2" mb={1}>
                                        משחק:{" "}
                                        <Typography component={NextLink} href={`/games/${r.game.id}`} target="_blank" variant="body2" color="primary">
                                            {gameLabel} ↗
                                        </Typography>
                                    </Typography>
                                )}
                                {r.details && (
                                    <Box mb={1}>
                                        <Typography
                                            sx={{
                                                whiteSpace: "pre-wrap",
                                                ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }),
                                            }}
                                        >
                                            {r.details}
                                        </Typography>
                                        {r.details.length > 180 && (
                                            <Button size="small" onClick={() => setExpanded((p) => ({ ...p, [r.id]: !open }))}>
                                                {open ? "הצגת פחות" : "הצגת הכל"}
                                            </Button>
                                        )}
                                    </Box>
                                )}
                                {r.status === "OPEN" ? (
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="inherit"
                                            disabled={busyId === r.id}
                                            onClick={() => setPending({ report: r, action: "NONE" })}
                                            data-testid={`admin-user-report-resolve-${r.id}`}
                                        >
                                            טופל
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="inherit"
                                            disabled={busyId === r.id}
                                            onClick={() => onDismiss(r.id)}
                                            data-testid={`admin-user-report-dismiss-${r.id}`}
                                        >
                                            דחייה
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="error"
                                            disabled={busyId === r.id}
                                            onClick={() => setPending({ report: r, action: "BAN" })}
                                            data-testid={`admin-user-report-ban-${r.id}`}
                                        >
                                            טיפול + השעיה
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Typography variant="caption" color="text.secondary">
                                        {[`${STATUS_LABELS[r.status]} · ${formatWhen(r.resolvedAt)}`, r.resolution].filter(Boolean).join(" · ")}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    );
                })
            )}

            <Dialog open={!!pending} onClose={busyId ? undefined : closeDialog} fullWidth maxWidth="xs" dir="rtl">
                <DialogTitle>{pending?.action === "BAN" ? `להשעות את ${targetName}?` : "סימון כטופל"}</DialogTitle>
                <DialogContent>
                    {pending?.action === "BAN" && (
                        <DialogContentText mb={2}>
                            המשתמש לא יוכל להתחבר ל-JoinUp. הדיווח יסומן כטופל.
                        </DialogContentText>
                    )}
                    <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        label="הערה פנימית (לא חובה)"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, RESOLUTION_MAX))}
                        helperText={`${note.length}/${RESOLUTION_MAX}`}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog} disabled={!!busyId}>ביטול</Button>
                    <Button
                        variant="contained"
                        color={pending?.action === "BAN" ? "error" : "primary"}
                        onClick={confirm}
                        disabled={!!busyId}
                        data-testid="admin-user-report-ban-confirm"
                    >
                        {pending?.action === "BAN" ? "השעיה" : "סימון כטופל"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} message={toast ?? ""} />
        </Stack>
    );
}
