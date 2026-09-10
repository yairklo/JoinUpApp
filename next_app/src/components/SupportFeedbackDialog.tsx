"use client";

import { useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";

import { supportApi, SupportMessageType } from "@/services/api/support";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Footer entry point for reporting a bug or sending a general message to the
 * app team. Signed-out visitors get a sign-in prompt instead of the form --
 * submissions require auth, same as every other user-generated-content POST
 * in this app. The plain "תמיכה" mailto link in Footer.tsx stays as the
 * no-login fallback; this is the additional structured, trackable path.
 */
export default function SupportFeedbackDialog() {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SupportMessageType>("BUG");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי לשלוח הודעה.");
        return;
      }
      await supportApi.submit({ type, message: trimmed, context: window.location.pathname }, token);
      setShowSuccess(true);
      setMessage("");
      setTimeout(() => {
        setShowSuccess(false);
        setOpen(false);
      }, 1500);
    } catch {
      setError("השליחה נכשלה, נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Typography
        component="button"
        onClick={() => setOpen(true)}
        variant="body2"
        sx={{
          color: "text.secondary",
          textDecoration: "none",
          fontWeight: 600,
          background: "none",
          border: 0,
          p: 0,
          cursor: "pointer",
          font: "inherit",
          "&:hover": { color: "primary.main", textDecoration: "underline" },
        }}
      >
        דיווח על באג / משוב
      </Typography>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" dir="rtl">
        <DialogTitle>דיווח על באג / משוב</DialogTitle>
        <DialogContent>
          <SignedOut>
            <Stack spacing={2} alignItems="flex-start" sx={{ py: 1 }}>
              <Typography>עליך להתחבר כדי לשלוח הודעה.</Typography>
              <SignInButton mode="modal">
                <Button variant="contained">התחברות</Button>
              </SignInButton>
            </Stack>
          </SignedOut>
          <SignedIn>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              {showSuccess && <Alert severity="success">תודה! ההודעה נשלחה בהצלחה.</Alert>}
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as SupportMessageType)}
                size="small"
                fullWidth
              >
                <MenuItem value="BUG">דיווח על באג</MenuItem>
                <MenuItem value="FEEDBACK">משוב כללי</MenuItem>
              </Select>
              <TextField
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                placeholder="מה תרצו לספר לנו?"
                multiline
                minRows={4}
                fullWidth
                helperText={`${message.length}/${MAX_MESSAGE_LENGTH}`}
              />
            </Stack>
          </SignedIn>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            <SignedOut>סגירה</SignedOut>
            <SignedIn>ביטול</SignedIn>
          </Button>
          <SignedIn>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting || !message.trim()}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              שליחה
            </Button>
          </SignedIn>
        </DialogActions>
      </Dialog>
    </>
  );
}
