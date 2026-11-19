"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ACCEPTED_IMAGE_TYPES, MAX_FIELD_PHOTOS } from "@joinup/shared/upload";
import { fieldPhotosApi, fieldPhotoSrc, type FieldPhoto } from "@/services/api/fieldPhotos";
import { useFieldPhotoUpload } from "@/hooks/useFieldPhotoUpload";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import UploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
// In RTL "earlier" is to the right, so the forward arrow moves a photo toward the start.
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SafeImage from "@/components/ui/SafeImage";

interface FieldPhotoGalleryProps {
  fieldId: string;
  /** Called after the published photos change (the first one is the field's cover). */
  onChanged?: () => void;
}

const overlayButton = {
  position: "absolute",
  bgcolor: "rgba(0,0,0,0.55)",
  color: "#fff",
  "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
  "&.Mui-disabled": { bgcolor: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.4)" },
} as const;

// Admin editor for a field's published photos: add several at once (published immediately),
// remove, and reorder. The first photo is the field's cover everywhere else in the app.
// Photos users suggested wait in PendingFieldPhotosPanel, not here.
export default function FieldPhotoGallery({ fieldId, onChanged }: FieldPhotoGalleryProps) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<FieldPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await fieldPhotosApi.list(fieldId, token);
      setPhotos(data.photos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "טעינת התמונות נכשלה");
    } finally {
      setLoading(false);
    }
  }, [fieldId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const afterChange = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  const { items, busy, addFiles, clearSettled } = useFieldPhotoUpload(fieldId, afterChange);
  const uploading = items.filter((it) => it.status !== "done" && it.status !== "error");
  const failed = items.filter((it) => it.status === "error");
  const slots = Math.max(0, MAX_FIELD_PHOTOS - photos.length - uploading.length);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    setError(null);
    clearSettled();
    const result = addFiles(selected, slots);
    setNotice(
      result.skippedCount > 0
        ? `נבחרו ${selected.length} תמונות, אבל נשארו רק ${slots} מקומות בגלריה. ${result.skippedCount} לא הועלו.`
        : null,
    );
  };

  const run = async (id: string, action: (token: string) => Promise<unknown>, failMessage: string) => {
    setError(null);
    setBusyId(id);
    try {
      const token = await getToken();
      if (!token) throw new Error("נדרש להתחבר מחדש");
      await action(token);
      await afterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : failMessage);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (photo: FieldPhoto) =>
    run(photo.id, (token) => fieldPhotosApi.remove(fieldId, photo.id, token), "הסרת התמונה נכשלה");

  const handleMove = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    setPhotos(next); // optimistic; reloaded from the server either way
    return run(
      photos[index].id,
      (token) => fieldPhotosApi.reorder(fieldId, next.map((p) => p.id), token),
      "שינוי הסדר נכשל",
    );
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={0.5}>
        גלריית תמונות ({photos.length}/{MAX_FIELD_PHOTOS})
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" mb={1}>
        התמונה הראשונה היא התמונה הראשית של המגרש.
      </Typography>
      <Box component="ul" display="flex" flexWrap="wrap" gap={1.5} mb={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
        {photos.map((photo, i) => (
          <Box
            component="li"
            key={photo.id}
            position="relative"
            width={112}
            height={112}
            borderRadius={1}
            overflow="hidden"
            sx={{ bgcolor: "grey.200", outline: i === 0 ? "2px solid" : "none", outlineColor: "primary.main" }}
          >
            <SafeImage
              src={fieldPhotoSrc(photo.url, 240)}
              alt={`תמונה ${i + 1} מתוך ${photos.length}`}
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
            />
            {i === 0 && (
              <Typography
                variant="caption"
                sx={{ position: "absolute", bottom: 0, insetInline: 0, textAlign: "center", bgcolor: "primary.main", color: "primary.contrastText" }}
              >
                תמונה ראשית
              </Typography>
            )}
            <IconButton
              size="small"
              onClick={() => handleRemove(photo)}
              disabled={busyId !== null}
              aria-label={`הסרת תמונה ${i + 1}`}
              sx={{ ...overlayButton, top: 2, insetInlineEnd: 2 }}
            >
              {busyId === photo.id ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <DeleteIcon fontSize="small" />}
            </IconButton>
            {photos.length > 1 && (
              <>
                <IconButton
                  size="small"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0 || busyId !== null}
                  aria-label={`הזזת תמונה ${i + 1} מקום אחד קדימה`}
                  sx={{ ...overlayButton, top: 2, insetInlineStart: 2 }}
                >
                  <ArrowForwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === photos.length - 1 || busyId !== null}
                  aria-label={`הזזת תמונה ${i + 1} מקום אחד אחורה`}
                  sx={{ ...overlayButton, top: 34, insetInlineStart: 2 }}
                >
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </>
            )}
          </Box>
        ))}
        <Box
          component="li"
          width={112}
          height={112}
          borderRadius={1}
          border="1px dashed"
          borderColor="divider"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {loading ? (
            <CircularProgress size={18} />
          ) : (
            <Button
              size="small"
              onClick={() => inputRef.current?.click()}
              disabled={busy || slots === 0}
              startIcon={busy ? <CircularProgress size={14} /> : <UploadIcon />}
            >
              הוסף
            </Button>
          )}
        </Box>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={handleFiles}
          aria-label="בחירת תמונות להעלאה"
        />
      </Box>

      <Box aria-live="polite">
        {uploading.length > 0 && (
          <Box mb={1}>
            <Typography variant="caption" color="text.secondary">
              מעלה {uploading.length} {uploading.length === 1 ? "תמונה" : "תמונות"}...
            </Typography>
            <LinearProgress sx={{ mt: 0.5, borderRadius: 999 }} />
          </Box>
        )}
        {notice && (
          <Alert severity="warning" onClose={() => setNotice(null)} sx={{ mb: 1 }}>
            {notice}
          </Alert>
        )}
        {failed.length > 0 && (
          <Alert severity="error" onClose={clearSettled} sx={{ mb: 1 }}>
            {failed.length === 1 ? `העלאת "${failed[0].name}" נכשלה` : `העלאת ${failed.length} תמונות נכשלה`}
          </Alert>
        )}
        {error && (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
