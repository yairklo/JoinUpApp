"use client";

import { useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import { usersApi } from "@/services/api/users";

const CONFIRM_WORD = "מחק";

export default function DeleteAccountCard() {
    const { getToken } = useAuth();
    const { signOut } = useClerk();
    const [open, setOpen] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
        if (busy) return;
        setOpen(false);
        setConfirmText("");
        setError(null);
    };

    const handleDelete = async () => {
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error("not signed in");
            await usersApi.deleteAccount(token);
        } catch (e) {
            console.error("Failed to delete account:", e);
            // The server wipes data first and deletes the Clerk user last, and the call is safe to
            // repeat, so a failure here can simply be retried.
            setError("מחיקת החשבון נכשלה. אפשר ללחוץ שוב כדי לנסות להשלים את המחיקה.");
            setBusy(false);
            return;
        }
        // The account is gone server-side. End the local session; if Clerk cannot, a hard reload
        // drops the (now invalid) session state anyway.
        try {
            // Leave `busy` set: the page is navigating away and the button must stay disabled.
            await signOut({ redirectUrl: "/" });
        } catch {
            window.location.href = "/";
        }
    };

    return (
        <>
            <Card elevation={3} sx={{ borderRadius: 3, mt: 3, border: "1px solid", borderColor: "error.light" }}>
                <CardContent>
                    <Typography variant="h6" fontWeight="bold" color="error" gutterBottom>
                        מחיקת חשבון
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        מחיקת החשבון מסירה לצמיתות את הפרופיל והמידע האישי שלכם, כולל חברים, הרשמות למשחקים ותגובות. לא ניתן לשחזר פעולה זו.
                    </Typography>
                    <Button variant="outlined" color="error" onClick={() => setOpen(true)}>
                        מחק את החשבון שלי
                    </Button>
                </CardContent>
            </Card>

            <Dialog open={open} onClose={close} dir="rtl" fullWidth maxWidth="xs">
                <DialogTitle>למחוק את החשבון?</DialogTitle>
                <DialogContent>
                    <DialogContentText mb={2}>
                        זו הפעולה האחרונה — החשבון יימחק מיד ולא ניתן יהיה לשחזר אותו. להמשך, הקלידו &quot;{CONFIRM_WORD}&quot;.
                    </DialogContentText>
                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        disabled={busy}
                        inputProps={{ "aria-label": "אישור מחיקה" }}
                    />
                    {error && (
                        <Typography variant="caption" color="error" role="alert" display="block" mt={1}>
                            {error}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={close} disabled={busy}>ביטול</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleDelete}
                        disabled={busy || confirmText.trim() !== CONFIRM_WORD}
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        מחק לצמיתות
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
