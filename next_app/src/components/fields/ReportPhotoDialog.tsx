"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldPhotosApi, type FieldPhotoReportReason } from "@/services/api/fieldPhotos";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";

export const REPORT_REASON_LABELS: Record<FieldPhotoReportReason, string> = {
    PEOPLE: "אנשים שאפשר לזהות (במיוחד ילדים)",
    INAPPROPRIATE: "תוכן לא הולם",
    WRONG_PLACE: "התמונה לא שייכת למגרש הזה",
    OTHER: "סיבה אחרת",
};

interface ReportPhotoDialogProps {
    open: boolean;
    onClose: () => void;
    fieldId: string;
    /** The photo being reported; the dialog is only meaningful while this is set. */
    photoId: string | null;
}

/**
 * "Report this photo": pick a reason and send it to the admins. The photo stays up until an admin
 * has looked at it, so the confirmation says what happens next rather than "removed".
 */
export default function ReportPhotoDialog({ open, onClose, fieldId, photoId }: ReportPhotoDialogProps) {
    const { getToken } = useAuth();
    const [reason, setReason] = useState<FieldPhotoReportReason | "">("");
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Each opening starts clean, so a second report never shows the previous one's result.
    useEffect(() => {
        if (open) {
            setReason("");
            setSent(false);
            setError(null);
        }
    }, [open, photoId]);

    const submit = async () => {
        if (!photoId || !reason) return;
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error("נדרש להתחבר מחדש");
            await fieldPhotosApi.report(fieldId, photoId, reason, token);
            setSent(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : "שליחת הדיווח נכשלה");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" dir="rtl" aria-labelledby="report-photo-title">
            <DialogTitle id="report-photo-title">דיווח על תמונה</DialogTitle>
            <DialogContent>
                {sent ? (
                    <Alert severity="success">תודה. הדיווח התקבל ויעבור בדיקה של צוות האתר.</Alert>
                ) : (
                    <FormControl>
                        <FormLabel id="report-photo-reason-label" sx={{ mb: 1 }}>
                            מה הבעיה בתמונה?
                        </FormLabel>
                        <RadioGroup
                            aria-labelledby="report-photo-reason-label"
                            value={reason}
                            onChange={(e) => setReason(e.target.value as FieldPhotoReportReason)}
                        >
                            {(Object.keys(REPORT_REASON_LABELS) as FieldPhotoReportReason[]).map((key) => (
                                <FormControlLabel key={key} value={key} control={<Radio />} label={REPORT_REASON_LABELS[key]} />
                            ))}
                        </RadioGroup>
                    </FormControl>
                )}
                {error && (
                    <Alert severity="error" sx={{ mt: 2 }} role="alert">
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy}>
                    {sent ? "סגירה" : "ביטול"}
                </Button>
                {!sent && (
                    <Button
                        variant="contained"
                        onClick={submit}
                        disabled={!reason || busy}
                        startIcon={busy ? <CircularProgress size={14} /> : undefined}
                    >
                        שליחת דיווח
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
