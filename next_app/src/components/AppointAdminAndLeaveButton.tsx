"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import Avatar from "@/components/Avatar";
import { getActionErrorMessage } from "@/utils/apiError";

// Server codes whose Hebrew message explains exactly what to do, so it is shown as is.
const SHOWN_CODES = new Set(["ADMIN_SUCCESSOR_REQUIRED", "INVALID_SUCCESSOR", "NO_CONFIRMED_SUCCESSOR", "LEAVE_CONFLICT"]);

export type AdminCandidate = { id: string; name?: string | null; avatar?: string | null };

/**
 * An organizer cannot leave a game/group without appointing another admin. This opens a picker of
 * eligible people and calls `onLeave(successorId)`; the server enforces the same rule.
 */
export default function AppointAdminAndLeaveButton({
    kind,
    candidates,
    onLeave,
    testId,
}: {
    kind: "game" | "group";
    candidates: AdminCandidate[];
    onLeave: (successorId: string, token: string) => Promise<void>;
    testId?: string;
}) {
    const { getToken } = useAuth();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noun = kind === "game" ? "המשחק" : "הקבוצה";

    const confirm = async () => {
        if (!selected) return;
        setLoading(true);
        setError(null);
        try {
            const token = await getToken().catch(() => "");
            await onLeave(selected, token || "");
            setOpen(false);
        } catch (e: unknown) {
            const code = (e as { code?: string } | null)?.code;
            setError(code && SHOWN_CODES.has(code) && e instanceof Error && e.message ? e.message : getActionErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<ExitToAppIcon />}
                onClick={() => { setSelected(null); setError(null); setOpen(true); }}
                data-testid={testId}
            >
                מנה מנהל ועזוב
            </Button>
            <Dialog open={open} onClose={() => !loading && setOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>מנה מנהל חדש</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 1 }}>
                        מנהל לא יכול לעזוב את {noun} בלי למנות מנהל אחר במקומו. בחר מי ינהל אחריך.
                    </DialogContentText>
                    {candidates.length === 0 ? (
                        <Alert severity="info">אין כרגע מי שאפשר למנות. אפשר להוסיף חברים ולנסות שוב.</Alert>
                    ) : (
                        <List dense sx={{ maxHeight: 320, overflow: "auto" }}>
                            {candidates.map((c) => (
                                <ListItemButton
                                    key={c.id}
                                    selected={selected === c.id}
                                    onClick={() => setSelected(c.id)}
                                    data-testid={`successor-${c.id}`}
                                >
                                    <ListItemAvatar>
                                        <Avatar src={c.avatar} alt={c.name || ""} name={c.name || ""} size="md" />
                                    </ListItemAvatar>
                                    <ListItemText primary={c.name || "משתמש"} />
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Stack direction="row" spacing={1}>
                        <Button onClick={() => setOpen(false)} disabled={loading}>ביטול</Button>
                        <Button color="error" variant="contained" onClick={confirm} disabled={!selected || loading}>
                            {loading ? <CircularProgress size={18} color="inherit" /> : "מנה ועזוב"}
                        </Button>
                    </Stack>
                </DialogActions>
            </Dialog>
        </>
    );
}
