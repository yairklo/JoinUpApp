"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi } from "@/services/api";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { getActionErrorMessage } from "@/utils/apiError";

// Quick-poll options mapped onto the 1-5 busyLevel scale
// (1=Empty, 2=Light, 3=Moderate, 4=Crowded, 5=Full — see FieldReport.busyLevel in schema.prisma)
const OPTIONS: Array<{ label: string; level: number; color: "success" | "info" | "warning" | "error" }> = [
  { label: "ריק", level: 1, color: "success" },
  { label: "מעט", level: 2, color: "info" },
  { label: "בינוני", level: 3, color: "warning" },
  { label: "עמוס", level: 5, color: "error" },
];

export default function CrowdReportWidget({ fieldId }: { fieldId: string }) {
  const { getToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const submit = async (level: number) => {
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי לדווח על העומס");
        return;
      }
      await fieldsApi.submitReport(fieldId, level, token);
      setDone(true);
      setShowSuccess(true);
    } catch (e) {
      console.error("[FIELD REPORT] Failed to submit crowd report:", e);
      setError(getActionErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <Paper
      elevation={6}
      sx={{
        position: "sticky",
        bottom: 16,
        zIndex: 10,
        p: 2,
        borderRadius: 3,
        direction: "rtl",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1.5,
      }}
    >
      {done ? (
        <Typography variant="subtitle1" fontWeight={700} sx={{ mx: "auto" }}>
          תודה על הדיווח!
        </Typography>
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={700}>
            איך העומס במגרש כרגע?
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
            {submitting ? (
              <CircularProgress size={28} />
            ) : (
              OPTIONS.map((opt) => (
                <Button
                  key={opt.level}
                  variant="outlined"
                  color={opt.color}
                  size="small"
                  onClick={() => submit(opt.level)}
                  sx={{ fontWeight: 700, minWidth: 72 }}
                >
                  {opt.label}
                </Button>
              ))
            )}
          </Stack>
        </>
      )}
    </Paper>

    <Snackbar
      open={showSuccess}
      autoHideDuration={3000}
      onClose={() => setShowSuccess(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="success" variant="filled" onClose={() => setShowSuccess(false)}>
        הדיווח נשלח בהצלחה, תודה!
      </Alert>
    </Snackbar>

    <Snackbar
      open={!!error}
      autoHideDuration={4000}
      onClose={() => setError(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="error" variant="filled" onClose={() => setError(null)}>
        {error}
      </Alert>
    </Snackbar>
    </>
  );
}
