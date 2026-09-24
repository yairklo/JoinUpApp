"use client";

import { useEffect, useState } from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Radio,
    RadioGroup,
    TextField,
    Typography
} from "@mui/material";
import type { MessageReportReason } from "@/services/api/chats";

const REASONS: { value: MessageReportReason; he: string; en: string }[] = [
    { value: "OFFENSIVE", he: "תוכן פוגעני", en: "Offensive content" },
    { value: "HARASSMENT", he: "הטרדה או בריונות", en: "Harassment or bullying" },
    { value: "INAPPROPRIATE", he: "תוכן לא הולם", en: "Inappropriate content" },
    { value: "SPAM", he: "ספאם", en: "Spam" },
    { value: "OTHER", he: "אחר", en: "Other" },
];

interface ReportMessageDialogProps {
    open: boolean;
    isRTL: boolean;
    messagePreview?: string;
    onClose: () => void;
    onSubmit: (reason: MessageReportReason, details?: string) => Promise<void>;
}

export default function ReportMessageDialog({ open, isRTL, messagePreview, onClose, onSubmit }: ReportMessageDialogProps) {
    const [reason, setReason] = useState<MessageReportReason>("OFFENSIVE");
    const [details, setDetails] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setReason("OFFENSIVE");
            setDetails("");
            setSubmitting(false);
        }
    }, [open]);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await onSubmit(reason, details.trim() || undefined);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={submitting ? undefined : onClose} dir={isRTL ? "rtl" : "ltr"} fullWidth maxWidth="xs" sx={{ zIndex: 2102 }}>
            <DialogTitle>{isRTL ? "דיווח על הודעה" : "Report message"}</DialogTitle>
            <DialogContent>
                {messagePreview && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ bgcolor: "action.hover", p: 1, borderRadius: 1, mb: 2, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                        {messagePreview}
                    </Typography>
                )}
                <Typography variant="subtitle2" gutterBottom>
                    {isRTL ? "מה הבעיה בהודעה?" : "What's wrong with this message?"}
                </Typography>
                <RadioGroup value={reason} onChange={(e) => setReason(e.target.value as MessageReportReason)}>
                    {REASONS.map((r) => (
                        <FormControlLabel key={r.value} value={r.value} control={<Radio size="small" />} label={isRTL ? r.he : r.en} />
                    ))}
                </RadioGroup>
                <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    size="small"
                    sx={{ mt: 1 }}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    inputProps={{ maxLength: 500 }}
                    placeholder={isRTL ? "פרטים נוספים (לא חובה)" : "Additional details (optional)"}
                />
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    {isRTL ? "הדיווח יישלח לצוות הניהול. המשתמש המדווח לא יידע מי דיווח." : "The report goes to the moderation team. The sender won't know who reported."}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>{isRTL ? "ביטול" : "Cancel"}</Button>
                <Button onClick={handleSubmit} color="error" variant="contained" disabled={submitting}>
                    {isRTL ? "שלח דיווח" : "Report"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
