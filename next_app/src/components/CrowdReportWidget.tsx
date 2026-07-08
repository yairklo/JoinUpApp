"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi } from "@/services/api";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";

// Quick-poll options mapped onto the 1-5 busyLevel scale
const OPTIONS: Array<{ label: string; level: number; color: "success" | "warning" | "error" }> = [
  { label: "ריק", level: 1, color: "success" },
  { label: "בינוני", level: 3, color: "warning" },
  { label: "עמוס", level: 5, color: "error" },
];

export default function CrowdReportWidget({ fieldId }: { fieldId: string }) {
  const { getToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (level: number) => {
    if (submitting || done) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fieldsApi.submitReport(fieldId, level, token);
      setDone(true);
    } catch (e) {
      console.error("[FIELD REPORT] Failed to submit crowd report:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
          <Stack direction="row" spacing={1}>
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
  );
}
