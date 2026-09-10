"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { supportApi, SupportMessage } from "@/services/api/support";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LoadingMotif from "@/components/motion/LoadingMotif";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";

const TYPE_LABELS: Record<string, string> = {
  BUG: "באג",
  FEEDBACK: "משוב",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "פתוח",
  RESOLVED: "טופל",
};

export default function AdminFeedbackPage() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const list = await supportApi.adminList(token);
    setRows(Array.isArray(list) ? list : []);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const handleResolve = useCallback(async (id: string) => {
    setActingId(id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const updated = await supportApi.adminResolve(id, token);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      setError("הפעולה נכשלה, נסה שוב.");
    } finally {
      setActingId(null);
    }
  }, [getToken]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={8}><LoadingMotif id="brand-pulse" label="טוען פניות…" /></Box>
    );
  }

  const openRows = rows.filter((r) => r.status === "OPEN");
  const resolvedRows = rows.filter((r) => r.status !== "OPEN");

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>פניות ודיווחי באגים</Typography>
      {error && <Alert severity="error">{error}</Alert>}

      {openRows.length === 0 ? (
        <Alert severity="success">אין פניות פתוחות.</Alert>
      ) : (
        openRows.map((row) => (
          <Card key={row.id}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" color={row.type === "BUG" ? "warning" : "default"} label={TYPE_LABELS[row.type] || row.type} />
                <Chip size="small" label={STATUS_LABELS[row.status] || row.status} />
                <Typography variant="caption" fontWeight={700}>{row.user.name || row.user.id}</Typography>
              </Stack>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{row.message}</Typography>
              {row.context && (
                <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                  {row.context}
                </Typography>
              )}
              <Stack direction="row" spacing={1} mt={2}>
                <Button
                  size="small"
                  disabled={actingId === row.id}
                  onClick={() => handleResolve(row.id)}
                >
                  סמן כטופל
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))
      )}

      {resolvedRows.length > 0 && (
        <>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2 }}>טופלו לאחרונה</Typography>
          {resolvedRows.map((row) => (
            <Card key={row.id} sx={{ opacity: 0.7 }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" color={row.type === "BUG" ? "warning" : "default"} label={TYPE_LABELS[row.type] || row.type} />
                  <Chip size="small" color="success" label={STATUS_LABELS[row.status] || row.status} />
                  <Typography variant="caption" fontWeight={700}>{row.user.name || row.user.id}</Typography>
                </Stack>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>{row.message}</Typography>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Stack>
  );
}
