"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { useAuth } from "@clerk/nextjs";
import { useReportUser } from "@/hooks/useReportUser";
import { resultsApi } from "@/services/api/results";
import { getErrorStatus } from "@/utils/apiError";
import { USER_REPORT_DETAILS_MAX } from "@/types/matchResult";
import type { UserReportReason } from "@/types/matchResult";

const REASONS: Array<{ value: UserReportReason; he: string }> = [
  { value: "HARASSMENT", he: "הטרדה או בריונות" },
  { value: "VIOLENCE", he: "אלימות או איומים" },
  { value: "CHEATING", he: "רמאות במשחק" },
  { value: "NO_SHOW", he: "לא הגיע למשחק" },
  { value: "FAKE_PROFILE", he: "פרופיל מזויף" },
  { value: "INAPPROPRIATE_CONTENT", he: "תוכן לא הולם" },
  { value: "OTHER", he: "אחר" },
];

export interface ReportUserDialogProps {
  open: boolean;
  onClose: () => void;
  /** User mode: the reported player. Dispute mode: the recorder (kept for API parity; the server resolves it). */
  targetId: string;
  /** Shown in the target row. Dispute mode: the game label (emoji + title + date). */
  targetName?: string;
  gameId?: string;
  mode?: "user" | "dispute";
  /** Called once a report was accepted (dispute mode uses it to swap the link for a caption). */
  onSent?: () => void;
}

type Status = "idle" | "submitting" | "success" | "error";

export default function ReportUserDialog({ open, onClose, targetId, targetName, gameId, mode = "user", onSent }: ReportUserDialogProps) {
  const dispute = mode === "dispute";
  const { getToken } = useAuth();
  const report = useReportUser();
  const [reason, setReason] = useState<UserReportReason | "">("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [rateLimited, setRateLimited] = useState(false);
  const { reset } = report;

  useEffect(() => {
    if (open) {
      setReason("");
      setDetails("");
      setStatus("idle");
      setRateLimited(false);
      reset();
    }
  }, [open, reset]);

  const submitting = status === "submitting";
  const canSubmit = (dispute || reason !== "") && !submitting;

  const submit = async () => {
    setStatus("submitting");
    setRateLimited(false);
    const text = details.trim() || undefined;
    let ok = false;
    if (dispute && gameId) {
      // Purpose-built endpoint: the server resolves the recorder and rejects own results.
      try {
        const token = await getToken();
        if (!token) throw new Error("Not signed in");
        await resultsApi.dispute(gameId, { details: text }, token);
        ok = true;
      } catch (e) {
        setRateLimited(getErrorStatus(e) === 429);
      }
    } else if (reason) {
      ok = await report.submit({ targetId, reason, gameId: gameId ?? null, details: text });
      setRateLimited(report.rateLimited);
    }
    setStatus(ok ? "success" : "error");
    if (ok) onSent?.();
  };

  const errorText = rateLimited || report.rateLimited
    ? "שלחתם הרבה דיווחים לאחרונה. נסו שוב מאוחר יותר."
    : typeof navigator !== "undefined" && navigator.onLine === false
      ? "אין חיבור לאינטרנט"
      : dispute ? "לא הצלחנו לשלוח את הדיווח. נסו שוב." : "לא הצלחנו לשלוח את הדיווח. נסו שוב.";

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      dir="rtl"
      fullWidth
      maxWidth="xs"
      sx={{ zIndex: 2102 }}
      data-testid="report-user-dialog"
      data-mode={mode}
    >
      {status === "success" ? (
        <>
          <DialogContent data-testid="report-user-success">
            <Stack alignItems="center" spacing={1.5} textAlign="center" py={2}>
              <Box sx={(t) => ({ width: 48, height: 48, borderRadius: "50%", display: "grid", placeItems: "center", color: "success.main", bgcolor: alpha(t.palette.success.main, 0.12) })}>
                <CheckRoundedIcon />
              </Box>
              <Typography variant="h6" fontWeight={800}>{dispute ? "תודה! נבדוק את התוצאה." : "תודה, קיבלנו את הדיווח"}</Typography>
              {!dispute && (
                <Typography variant="body2" color="text.secondary">
                  הצוות שלנו יבדוק אותו. אם מישהו גורם לך לאי נוחות, אפשר גם לחסום אותו מהפרופיל.
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>סגירה</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>{dispute ? "דיווח על תוצאה שגויה" : "דיווח על שחקן"}</DialogTitle>
          <DialogContent>
            {targetName && (
              <Typography variant="body2" color="text.secondary" noWrap title={targetName} sx={{ bgcolor: "action.hover", p: 1, borderRadius: 1, mb: 2 }}>
                {targetName}
              </Typography>
            )}
            {!dispute && (
              <>
                <Typography variant="subtitle2" gutterBottom>מה קרה?</Typography>
                <RadioGroup value={reason} onChange={(e) => setReason(e.target.value as UserReportReason)}>
                  {REASONS.map((r) => (
                    <FormControlLabel
                      key={r.value}
                      value={r.value}
                      disabled={submitting}
                      control={<Radio size="small" inputProps={{ "data-testid": `report-user-reason-${r.value}` } as React.InputHTMLAttributes<HTMLInputElement>} />}
                      label={r.he}
                      sx={{ minHeight: 44 }}
                    />
                  ))}
                </RadioGroup>
              </>
            )}
            {dispute && <Typography variant="subtitle2" gutterBottom>מה לא נכון?</Typography>}
            <TextField
              fullWidth multiline minRows={3} size="small" sx={{ mt: 1 }} disabled={submitting}
              value={details} onChange={(e) => setDetails(e.target.value.slice(0, USER_REPORT_DETAILS_MAX))}
              placeholder={dispute ? "לדוגמה: התוצאה הייתה 4–3 ולא 3–2" : "פרטים נוספים (לא חובה)"}
              inputProps={{ maxLength: USER_REPORT_DETAILS_MAX, "data-testid": "report-user-details" }}
              helperText={`${details.length}/${USER_REPORT_DETAILS_MAX}`}
              FormHelperTextProps={{ sx: { textAlign: "end", color: details.length >= USER_REPORT_DETAILS_MAX ? "error.main" : undefined } }}
            />
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              {dispute
                ? "הצוות שלנו יבדוק את התוצאה מול מנהלי המשחק."
                : "הדיווח נשלח לצוות JoinUp ונבדק ידנית. השחקן לא יידע מי דיווח."}
            </Typography>
            {status === "error" && (
              <Alert severity="error" sx={{ mt: 1.5 }} data-testid="report-user-error">{errorText}</Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={submitting} data-testid="report-user-cancel">ביטול</Button>
            <Button
              onClick={submit}
              disabled={!canSubmit}
              color={dispute ? "primary" : "error"}
              variant="contained"
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              data-testid="report-user-submit"
            >
              {dispute ? "שליחה" : "שליחת דיווח"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
