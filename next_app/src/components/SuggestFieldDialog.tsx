"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CircularProgress from "@mui/material/CircularProgress";
import { fieldSuggestionsApi } from "@/services/api/fieldSuggestions";

type PaidChoice = "yes" | "no" | "unknown";

interface SuggestFieldDialogProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the venue name, e.g. with what the user typed into the field search. */
  initialName?: string;
  /** Called after a successful submit (the dialog closes itself); the parent shows the confirmation. */
  onSubmitted: () => void;
}

// "הצע מגרש חדש": a request to the product admins to add a venue to the public list.
// It does not create a field -- the game creator still has to pick an existing field or a
// free-form location for their game.
export default function SuggestFieldDialog({ open, onClose, initialName = "", onSubmitted }: SuggestFieldDialogProps) {
  const { getToken } = useAuth();
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState("");
  const [paid, setPaid] = useState<PaidChoice>("unknown");
  const [contactInfo, setContactInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setAddress("");
    setPaid("unknown");
    setContactInfo("");
    setError(null);
  }, [open, initialName]);

  const canSubmit = name.trim() !== "" && address.trim() !== "" && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("יש להתחבר כדי להציע מגרש");
      await fieldSuggestionsApi.submit(
        {
          name: name.trim(),
          address: address.trim(),
          isPaid: paid === "unknown" ? null : paid === "yes",
          ...(contactInfo.trim() ? { contactInfo: contactInfo.trim() } : {}),
        },
        token
      );
      onClose();
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "שליחת הבקשה נכשלה, נסו שוב");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="xs" dir="rtl">
      <DialogTitle>הצע מגרש חדש</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            הבקשה תישלח לצוות JoinUp. אחרי בדיקה נוסיף את המגרש לרשימה וכולם יוכלו לבחור בו.
          </Typography>
          <TextField
            label="שם המגרש"
            required
            fullWidth
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200, dir: "rtl" } }}
          />
          <TextField
            label="כתובת"
            required
            fullWidth
            size="small"
            placeholder="רחוב, מספר, עיר"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 300, dir: "rtl" } }}
          />
          <Stack spacing={0.75}>
            <Typography variant="body2">האם המגרש בתשלום?</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={paid}
              onChange={(_e, v: PaidChoice | null) => v && setPaid(v)}
              aria-label="האם המגרש בתשלום"
            >
              <ToggleButton value="yes">כן</ToggleButton>
              <ToggleButton value="no">לא</ToggleButton>
              <ToggleButton value="unknown">לא יודע/ת</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <TextField
            label="איש קשר (אופציונלי)"
            fullWidth
            size="small"
            placeholder="שם / טלפון / קישור"
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200, dir: "rtl" } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>ביטול</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          שליחת בקשה
        </Button>
      </DialogActions>
    </Dialog>
  );
}
