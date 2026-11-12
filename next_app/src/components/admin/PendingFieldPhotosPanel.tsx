"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { MAX_FIELD_PHOTOS } from "@joinup/shared/upload";
import { fieldPhotosApi, fieldPhotoSrc, type PendingFieldPhoto } from "@/services/api/fieldPhotos";
import FieldPhotoViewer from "@/components/fields/FieldPhotoViewer";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

// Admin queue for photos users suggested for a field. Approving publishes the photo at the end of
// the field's gallery; rejecting deletes the stored image. Both free the uploader's pending slot.
export default function PendingFieldPhotosPanel() {
  const { getToken } = useAuth();
  const [photos, setPhotos] = useState<PendingFieldPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PendingFieldPhoto | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setPhotos(await fieldPhotosApi.listPending(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "טעינת התמונות נכשלה");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Optimistic: the row leaves at once and comes back, with an error, if the server refuses.
  const resolve = async (photo: PendingFieldPhoto, action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm(`לדחות את התמונה שהוצעה ל"${photo.field.name}"? התמונה תימחק.`)) return;
    const before = photos;
    setBusyId(photo.id);
    setPhotos((prev) =>
      prev
        .filter((p) => p.id !== photo.id)
        // Approving uses one of the field's slots, which matters to its other pending photos.
        .map((p) =>
          action === "approve" && p.field.id === photo.field.id
            ? { ...p, field: { ...p.field, approvedCount: p.field.approvedCount + 1 } }
            : p,
        ),
    );
    try {
      const token = await getToken();
      if (!token) throw new Error("נדרש להתחבר מחדש");
      await fieldPhotosApi[action](photo.id, token);
      setError(null);
    } catch (e) {
      setPhotos(before);
      setError(e instanceof Error ? e.message : action === "approve" ? "אישור התמונה נכשל" : "דחיית התמונה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <Typography fontWeight={700}>תמונות מגרשים שממתינות לאישור</Typography>
          <Chip size="small" color={photos.length ? "warning" : "default"} label={photos.length} />
          {loading && <CircularProgress size={16} />}
        </Stack>
        <Divider sx={{ mb: 2 }} />
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!loading && photos.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={2}>
            אין תמונות שממתינות לאישור
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {photos.map((p) => {
              const full = p.field.approvedCount >= MAX_FIELD_PHOTOS;
              return (
                <Stack
                  key={p.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: "divider" }}
                >
                  <ButtonBase
                    onClick={() => setViewing(p)}
                    aria-label={`הגדלת התמונה שהוצעה ל${p.field.name}`}
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
                      src={fieldPhotoSrc(p.url, 480)}
                      alt={`תמונה שהוצעה ל${p.field.name}`}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </ButtonBase>
                  <Stack spacing={0.5} flex={1} minWidth={0}>
                    <Typography fontWeight={700} component={Link} href={`/fields/${p.field.id}`} sx={{ color: "inherit" }}>
                      {p.field.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.uploader?.name || "משתמש"} · {new Date(p.createdAt).toLocaleDateString("he-IL")}
                    </Typography>
                    <Box>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={full ? "error" : "default"}
                        label={`${p.field.approvedCount}/${MAX_FIELD_PHOTOS} תמונות בגלריה`}
                      />
                    </Box>
                    {full && (
                      <Typography variant="caption" color="error">
                        הגלריה מלאה. כדי לאשר, יש להסיר קודם תמונה קיימת מהמגרש.
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<CheckIcon />}
                      disabled={full || busyId === p.id}
                      onClick={() => resolve(p, "approve")}
                    >
                      אישור
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<CloseIcon />}
                      disabled={busyId === p.id}
                      onClick={() => resolve(p, "reject")}
                    >
                      דחייה
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
        fieldName={viewing?.field.name ?? ""}
        photos={viewing ? [{ id: viewing.id, url: viewing.url }] : []}
        startIndex={0}
      />
    </Card>
  );
}
