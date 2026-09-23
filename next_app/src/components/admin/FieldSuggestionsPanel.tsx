"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldSuggestionsApi, FieldSuggestion } from "@/services/api/fieldSuggestions";
import FieldEditorDialog, { FieldEditorInitialValues } from "@/components/admin/FieldEditorDialog";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import CircularProgress from "@mui/material/CircularProgress";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

const PAID_LABEL = (isPaid: boolean | null) => (isPaid === true ? "בתשלום" : isPaid === false ? "חינם" : "תשלום: לא ידוע");

function toInitialValues(s: FieldSuggestion): FieldEditorInitialValues {
  const sport = s.sport?.toUpperCase();
  return {
    name: s.name,
    location: s.address,
    type: s.isPaid ? "closed" : "open",
    description: s.contactInfo ? `איש קשר (מהצעת משתמש): ${s.contactInfo}` : "",
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    ...(sport === "SOCCER" || sport === "BASKETBALL" || sport === "TENNIS" ? { supportedSports: [sport] } : {}),
  };
}

// Admin queue for "הצע מגרש חדש" requests. Approving opens the regular field editor prefilled
// from the request; saving it creates the real listed Field and resolves the suggestion in one
// server call (so it never goes through fieldsApi.create and can't produce a duplicate field).
export default function FieldSuggestionsPanel({ onFieldCreated }: { onFieldCreated: () => void }) {
  const { getToken } = useAuth();
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<FieldSuggestion | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setSuggestions(await fieldSuggestionsApi.adminList(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "טעינת ההצעות נכשלה");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReject = async (s: FieldSuggestion) => {
    if (!window.confirm(`לדחות את ההצעה "${s.name}"?`)) return;
    setRejectingId(s.id);
    try {
      const token = await getToken();
      if (!token) return;
      await fieldSuggestionsApi.adminReject(s.id, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "דחיית ההצעה נכשלה");
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <Typography fontWeight={700}>הצעות מגרשים ממשתמשים</Typography>
          <Chip size="small" color={suggestions.length ? "warning" : "default"} label={suggestions.length} />
          {loading && <CircularProgress size={16} />}
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!loading && suggestions.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={2}>
            אין הצעות ממתינות
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {suggestions.map((s) => (
              <Stack
                key={s.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", sm: "center" }}
                sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: "divider" }}
              >
                <Stack spacing={0.5} flex={1} minWidth={0}>
                  <Typography fontWeight={700}>{s.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.address}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                    <Chip size="small" label={PAID_LABEL(s.isPaid)} />
                    {s.contactInfo && <Chip size="small" variant="outlined" label={`איש קשר: ${s.contactInfo}`} />}
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Avatar src={s.user?.imageUrl || undefined} sx={{ width: 20, height: 20 }} />
                      <Typography variant="caption" color="text.secondary">
                        {s.user?.name || "משתמש"} · {new Date(s.createdAt).toLocaleDateString("he-IL")}
                      </Typography>
                    </Stack>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" startIcon={<CheckIcon />} onClick={() => setApproving(s)}>
                    אשר והוסף מגרש
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<CloseIcon />}
                    disabled={rejectingId === s.id}
                    onClick={() => handleReject(s)}
                  >
                    דחה
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>

      <FieldEditorDialog
        open={!!approving}
        field={null}
        createTitle={approving ? `אישור הצעה: ${approving.name}` : undefined}
        initialValues={approving ? toInitialValues(approving) : undefined}
        createField={(payload, token) => fieldSuggestionsApi.adminApprove(approving!.id, payload, token)}
        onClose={() => setApproving(null)}
        onSaved={() => {
          // The dialog stays open after the first save so photos can be added; reloading
          // drops the now-APPROVED suggestion from the queue.
          load();
          onFieldCreated();
        }}
      />
    </Card>
  );
}
