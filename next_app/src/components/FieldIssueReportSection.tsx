"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi, FieldIssueCategory, FieldIssueReport } from "@/services/api/fields";
import { getActionErrorMessage } from "@/utils/apiError";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

const CATEGORY_LABELS: Record<FieldIssueCategory, string> = {
  POTHOLE: "בור במגרש",
  LIGHTING: "תאורה לקויה",
  SURFACE: "משטח פגום",
  GOAL_NET: "שער/רשת פגומים",
  FENCE: "גדר פגומה",
  OTHER: "אחר",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FieldIssueCategory[];

export default function FieldIssueReportSection({ fieldId }: { fieldId: string }) {
  const { getToken, userId } = useAuth();
  const [issues, setIssues] = useState<FieldIssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<FieldIssueCategory>("POTHOLE");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let ignore = false;
    fieldsApi
      .getIssues(fieldId)
      .then((data) => {
        if (!ignore) setIssues(data);
      })
      .catch(() => {
        if (!ignore) setIssues([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [fieldId]);

  const openIssues = issues.filter((i) => i.status === "OPEN");

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי לדווח על ליקוי");
        return;
      }
      const created = await fieldsApi.addIssue(
        fieldId,
        { category, description: description.trim() || undefined },
        token
      );
      setIssues((prev) => [created, ...prev]);
      setDescription("");
      setShowSuccess(true);
    } catch (e) {
      setError(getActionErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card sx={{ mb: 3, p: 3 }} dir="rtl">
      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        דיווח על ליקויים במגרש
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        בורות, תאורה לקויה, ציוד שבור וכו&apos; — הדיווחים נשמרים ומוצגים כאן לכולם
      </Typography>

      {loading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          טוען דיווחים…
        </Typography>
      ) : openIssues.length > 0 ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {openIssues.map((i) => (
            <Chip key={i.id} label={CATEGORY_LABELS[i.category]} color="warning" variant="outlined" size="small" />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          לא דווחו ליקויים פתוחים במגרש זה.
        </Typography>
      )}

      {userId ? (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Select
            size="small"
            value={category}
            onChange={(e) => setCategory(e.target.value as FieldIssueCategory)}
            disabled={submitting}
            sx={{ minWidth: 160 }}
          >
            {CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            placeholder="תיאור (לא חובה)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            inputProps={{ maxLength: 1000 }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <Button variant="contained" color="warning" onClick={submit} disabled={submitting} sx={{ minWidth: 96 }}>
            {submitting ? <CircularProgress size={20} color="inherit" /> : "דווח"}
          </Button>
        </Box>
      ) : (
        <Alert severity="info">יש להתחבר כדי לדווח על ליקוי.</Alert>
      )}

      <Snackbar
        open={showSuccess}
        autoHideDuration={3000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setShowSuccess(false)}>
          הדיווח נשלח ונשמר, תודה!
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
    </Card>
  );
}
