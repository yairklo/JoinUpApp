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
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import { fieldSuggestionsApi } from "@/services/api/fieldSuggestions";
import ParkingLocationInput, { EMPTY_PARKING, parkingPayload, type ParkingValue } from "@/components/ParkingLocationInput";

type PaidChoice = "yes" | "no" | "unknown";

/** The one CTA every "no matching field" state uses to open this dialog. */
export const ADD_FIELD_CTA_TEXT = "לא מצאת את המגרש שלך? הוסף אותו ונאשר בהקדם";

interface SuggestFieldDialogProps {
  open: boolean;
  onClose: () => void;
  /** Prefills the venue name, e.g. with what the user typed into the field search. */
  initialName?: string;
  /** Called after a successful submit. The dialog itself then shows the "pending approval" state. */
  onSubmitted?: () => void;
}

// "הוספת מגרש": a request to the product admins to add a venue to the public list. It is the
// single add-field flow, opened from the fields page and from the create-game field pickers.
// It does not create a field or a game -- the venue is listed only once an admin approves it,
// so after submitting the dialog says it is pending approval.
export default function SuggestFieldDialog({ open, onClose, initialName = "", onSubmitted }: SuggestFieldDialogProps) {
  const { getToken } = useAuth();
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState("");
  const [paid, setPaid] = useState<PaidChoice>("unknown");
  const [contactInfo, setContactInfo] = useState("");
  const [parking, setParking] = useState<ParkingValue>(EMPTY_PARKING);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setAddress("");
    setPaid("unknown");
    setContactInfo("");
    setParking(EMPTY_PARKING);
    setSubmitted(false);
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
          ...parkingPayload(parking),
        },
        token
      );
      setSubmitted(true);
      onSubmitted?.();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "שליחת הבקשה נכשלה, נסו שוב");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" dir="rtl" aria-labelledby="suggest-field-pending-title">
        <DialogContent>
          <Stack
            spacing={1.5}
            alignItems="center"
            textAlign="center"
            sx={{ pt: 2 }}
            role="status"
            aria-live="polite"
            data-testid="add-field-pending"
          >
            <HourglassTopRoundedIcon color="warning" sx={{ fontSize: 44 }} aria-hidden />
            <Typography id="suggest-field-pending-title" variant="h6" component="h2" fontWeight={800}>
              המגרש נשלח וממתין לאישור
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {name.trim() ? `קיבלנו את "${name.trim()}". ` : ""}
              צוות JoinUp יבדוק את הפרטים ויאשר בהקדם. עד האישור המגרש לא יופיע ברשימת המגרשים.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose} autoFocus>
            סגירה
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      dir="rtl"
      aria-labelledby="suggest-field-title"
    >
      <DialogTitle id="suggest-field-title">הוספת מגרש</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            הבקשה תישלח לצוות JoinUp. אחרי אישור המגרש יתווסף לרשימה וכולם יוכלו לבחור בו.
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
          <ParkingLocationInput
            value={parking}
            onChange={setParking}
            addressForGeocoding={[name.trim(), address.trim(), "ישראל"].filter(Boolean).join(" ")}
            disabled={submitting}
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
