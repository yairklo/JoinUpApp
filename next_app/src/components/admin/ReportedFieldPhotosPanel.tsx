"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { fieldPhotosApi, fieldPhotoSrc, type ReportedFieldPhoto } from "@/services/api/fieldPhotos";
import { REPORT_REASON_LABELS } from "@/components/fields/ReportPhotoDialog";
import FieldPhotoViewer from "@/components/fields/FieldPhotoViewer";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import DoneIcon from "@mui/icons-material/Done";

// Admin queue for published photos users have reported. Reports never hide a photo by themselves:
// an admin either takes it down (its reports go with it) or dismisses the reports and leaves it up.
export default function ReportedFieldPhotosPanel() {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<ReportedFieldPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ReportedFieldPhoto | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setEntries(await fieldPhotosApi.listReports(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "טעינת הדיווחים נכשלה");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (entry: ReportedFieldPhoto, action: "remove" | "dismiss") => {
    if (action === "remove" && !window.confirm(`להסיר את התמונה מהמגרש "${entry.photo.field.name}"? התמונה תימחק.`)) return;
    const before = entries;
    setBusyId(entry.photo.id);
    setEntries((prev) => prev.filter((e) => e.photo.id !== entry.photo.id));
    try {
      const token = await getToken();
      if (!token) throw new Error("נדרש להתחבר מחדש");
      if (action === "remove") await fieldPhotosApi.remove(entry.photo.field.id, entry.photo.id, token);
      else await fieldPhotosApi.resolveReports(entry.photo.id, token);
      setError(null);
    } catch (e) {
      setEntries(before);
      setError(e instanceof Error ? e.message : action === "remove" ? "הסרת התמונה נכשלה" : "סגירת הדיווחים נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <Typography fontWeight={700}>תמונות מגרשים שדווחו</Typography>
          <Chip size="small" color={entries.length ? "error" : "default"} label={entries.length} />
          {loading && <CircularProgress size={16} />}
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!loading && entries.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={2}>
            אין תמונות שדווחו
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {entries.map((entry) => {
              const { photo } = entry;
              return (
                <Stack
                  key={photo.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: "divider" }}
                >
                  <ButtonBase
                    onClick={() => setViewing(entry)}
                    aria-label={`הגדלת תמונה שדווחה ב${photo.field.name}`}
                    sx={{
                      width: { xs: "100%", sm: 120 },
                      height: { xs: 180, sm: 90 },
                      flexShrink: 0,
                      borderRadius: 1.5,
                      overflow: "hidden",
                      bgcolor: "action.hover",
                      cursor: "zoom-in",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fieldPhotoSrc(photo.url, 480)}
                      alt={`תמונה שדווחה ב${photo.field.name}`}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </ButtonBase>
                  <Stack spacing={0.75} flex={1} minWidth={0}>
                    <Typography fontWeight={700} component={Link} href={`/fields/${photo.field.id}`} sx={{ color: "inherit" }}>
                      {photo.field.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.count === 1 ? "דיווח אחד" : `${entry.count} דיווחים`} · הראשון ב-
                      {new Date(entry.firstReportedAt).toLocaleDateString("he-IL")}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {(Object.entries(entry.reasons) as [keyof typeof REPORT_REASON_LABELS, number][]).map(([reason, n]) => (
                        <Chip
                          key={reason}
                          size="small"
                          variant="outlined"
                          color={reason === "PEOPLE" ? "error" : "default"}
                          label={`${REPORT_REASON_LABELS[reason] ?? reason} (${n})`}
                        />
                      ))}
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      color="error"
                      variant="contained"
                      startIcon={<DeleteIcon />}
                      disabled={busyId === photo.id}
                      onClick={() => act(entry, "remove")}
                    >
                      הסרת התמונה
                    </Button>
                    <Button
                      size="small"
                      startIcon={<DoneIcon />}
                      disabled={busyId === photo.id}
                      onClick={() => act(entry, "dismiss")}
                    >
                      התעלמות
                    </Button>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        )}
      </CardContent>
      <FieldPhotoViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        fieldName={viewing?.photo.field.name ?? ""}
        photos={viewing ? [{ id: viewing.photo.id, url: viewing.photo.url }] : []}
        startIndex={0}
      />
    </Card>
  );
}
