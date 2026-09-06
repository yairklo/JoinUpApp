"use client";

import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi } from "@/services/api/fields";
import { validateImageFile, ACCEPTED_IMAGE_TYPES } from "@/components/ImageUploadField";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import UploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";

interface FieldPhotoGalleryProps {
  fieldId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}

// Multi-file gallery variant of ImageUploadField -- that component is built
// for exactly one image (an avatar-style slot), so this is a separate
// component rather than a forced reuse, but it shares the same validation
// helpers and the same upload middleware/conventions on the backend
// (POST/DELETE /api/fields/:id/photos).
export default function FieldPhotoGallery({ fieldId, photos, onChange }: FieldPhotoGalleryProps) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => inputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("נדרש להתחבר מחדש");
      const updated = await fieldsApi.addPhoto(fieldId, file, token);
      onChange(updated.photos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת התמונה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (url: string) => {
    setError(null);
    setRemovingUrl(url);
    try {
      const token = await getToken();
      if (!token) throw new Error("נדרש להתחבר מחדש");
      const updated = await fieldsApi.removePhoto(fieldId, url, token);
      onChange(updated.photos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הסרת התמונה נכשלה");
    } finally {
      setRemovingUrl(null);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={1}>
        גלריית תמונות ({photos.length})
      </Typography>
      <Box display="flex" flexWrap="wrap" gap={1.5} mb={1}>
        {photos.map((url) => (
          <Box
            key={url}
            position="relative"
            width={96}
            height={96}
            borderRadius={1}
            overflow="hidden"
            sx={{ backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <IconButton
              size="small"
              onClick={() => handleRemove(url)}
              disabled={removingUrl === url}
              sx={{
                position: "absolute",
                top: 2,
                left: 2,
                bgcolor: "rgba(0,0,0,0.55)",
                color: "#fff",
                "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
              }}
            >
              {removingUrl === url ? <CircularProgress size={14} sx={{ color: "#fff" }} /> : <DeleteIcon fontSize="small" />}
            </IconButton>
          </Box>
        ))}
        <Box
          width={96}
          height={96}
          borderRadius={1}
          border="1px dashed"
          borderColor="divider"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Button size="small" onClick={handlePick} disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : <UploadIcon />}>
            הוסף
          </Button>
        </Box>
        <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} hidden onChange={handleFileChange} />
      </Box>
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
}
