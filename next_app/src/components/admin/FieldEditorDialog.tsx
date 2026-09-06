"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { fieldsApi, Field } from "@/services/api/fields";
import { SPORT_MAPPING } from "@/utils/sports";
import ImageUploadField from "@/components/ImageUploadField";
import FieldPhotoGallery from "@/components/admin/FieldPhotoGallery";
import FieldLocationPicker from "@/components/admin/FieldLocationPicker";

import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";

// SPORT_MAPPING's own type (from the vendored shared/sports.d.ts) is
// Record<string, string> -- too loose to derive a literal union from via
// `keyof typeof`, so this list is kept explicit and in sync with the
// backend's SportType enum (server/prisma/schema.prisma) by hand.
type SportKey = "SOCCER" | "BASKETBALL" | "TENNIS";
const SPORT_KEYS: SportKey[] = ["SOCCER", "BASKETBALL", "TENNIS"];

interface FieldEditorDialogProps {
  open: boolean;
  field: Field | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  location: string;
  city: string;
  neighborhood: string;
  street: string;
  streetNumber: string;
  type: "open" | "closed";
  price: string;
  description: string;
  phone: string;
  email: string;
  supportedSports: SportKey[];
  lat: number | null;
  lng: number | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  location: "",
  city: "",
  neighborhood: "",
  street: "",
  streetNumber: "",
  type: "open",
  price: "",
  description: "",
  phone: "",
  email: "",
  supportedSports: ["SOCCER"],
  lat: null,
  lng: null,
};

function fieldToForm(field: Field): FormState {
  return {
    name: field.name || "",
    location: field.location || "",
    city: field.city || "",
    neighborhood: field.neighborhood || "",
    street: field.street || "",
    streetNumber: field.streetNumber || "",
    type: field.type === "closed" ? "closed" : "open",
    price: field.price != null ? String(field.price) : "",
    description: field.description || "",
    phone: field.phone || "",
    email: field.email || "",
    supportedSports: (field.supportedSports?.length ? field.supportedSports : ["SOCCER"]) as SportKey[],
    lat: field.lat ?? null,
    lng: field.lng ?? null,
  };
}

export default function FieldEditorDialog({ open, field, onClose, onSaved }: FieldEditorDialogProps) {
  const { getToken } = useAuth();
  const isEdit = !!field;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the just-created field so a "create" session can immediately offer
  // image/photo upload without forcing a second "edit" round-trip.
  const [savedField, setSavedField] = useState<Field | null>(null);

  useEffect(() => {
    if (open) {
      setForm(field ? fieldToForm(field) : EMPTY_FORM);
      setSavedField(field);
      setError(null);
    }
  }, [open, field]);

  const activeField = savedField || field;

  const toggleSport = (sport: SportKey) => {
    setForm((f) => {
      const has = f.supportedSports.includes(sport);
      const next = has ? f.supportedSports.filter((s) => s !== sport) : [...f.supportedSports, sport];
      return { ...f, supportedSports: next };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.location.trim()) {
      setError("שם וכתובת הם שדות חובה");
      return;
    }
    if (form.supportedSports.length === 0) {
      setError("יש לבחור לפחות ענף ספורט אחד");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("נדרש להתחבר מחדש");

      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        city: form.city.trim() || undefined,
        neighborhood: form.neighborhood.trim() || undefined,
        street: form.street.trim() || undefined,
        streetNumber: form.streetNumber.trim() || undefined,
        type: form.type,
        price: form.type === "closed" ? Number(form.price) || 0 : 0,
        description: form.description.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        supportedSports: form.supportedSports,
        lat: form.lat ?? undefined,
        lng: form.lng ?? undefined,
      };

      if (activeField) {
        const updated = await fieldsApi.update(activeField.id, payload, token);
        setSavedField(updated);
      } else {
        const created = await fieldsApi.create(payload, token);
        setSavedField(created);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת המגרש נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    const token = await getToken();
    if (!token || !activeField) throw new Error("יש לשמור את המגרש לפני העלאת תמונה");
    const result = await fieldsApi.uploadImage(activeField.id, file, token);
    setSavedField((f) => (f ? { ...f, image: result.image } : f));
    return { imageUrl: result.image };
  };

  const handleImageRemove = async () => {
    const token = await getToken();
    if (!token || !activeField) return;
    await fieldsApi.removeImage(activeField.id, token);
    setSavedField((f) => (f ? { ...f, image: null } : f));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen dir="rtl">
      <DialogTitle>{isEdit ? `עריכת מגרש: ${field?.name}` : "מגרש חדש"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField label="שם *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
          <TextField label="כתובת *" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} fullWidth />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="עיר" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} fullWidth />
            <TextField label="שכונה" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} fullWidth />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="רחוב" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} fullWidth />
            <TextField label="מספר" value={form.streetNumber} onChange={(e) => setForm({ ...form, streetNumber: e.target.value })} sx={{ maxWidth: 120 }} />
          </Stack>

          <FieldLocationPicker
            lat={form.lat}
            lng={form.lng}
            addressForGeocoding={[form.street, form.streetNumber, form.neighborhood, form.city || form.location, "ישראל"]
              .filter(Boolean)
              .join(" ")}
            onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              label="סוג"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "open" | "closed" })}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="open">פתוח</MenuItem>
              <MenuItem value="closed">סגור / מקורה</MenuItem>
            </TextField>
            {form.type === "closed" && (
              <TextField
                label="מחיר לשעה (₪)"
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                fullWidth
              />
            )}
          </Stack>

          <Box>
            <Typography variant="body2" color="text.secondary" mb={0.5}>ענפי ספורט נתמכים *</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {SPORT_KEYS.map((sport) => (
                <Chip
                  key={sport}
                  label={SPORT_MAPPING[sport]}
                  color={form.supportedSports.includes(sport) ? "primary" : "default"}
                  onClick={() => toggleSport(sport)}
                  variant={form.supportedSports.includes(sport) ? "filled" : "outlined"}
                />
              ))}
            </Stack>
          </Box>

          <TextField
            label="תיאור"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            minRows={2}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="טלפון" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} fullWidth />
            <TextField label="אימייל" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} fullWidth />
          </Stack>

          <Divider />

          {activeField ? (
            <>
              <Box>
                <Typography variant="body2" color="text.secondary" mb={1}>תמונה ראשית</Typography>
                <ImageUploadField
                  imageUrl={activeField.image}
                  name={form.name}
                  label="העלאת תמונה"
                  onUpload={handleImageUpload}
                  onUploaded={(url) => setSavedField((f) => (f ? { ...f, image: url } : f))}
                  onRemove={handleImageRemove}
                  onRemoved={() => setSavedField((f) => (f ? { ...f, image: null } : f))}
                />
              </Box>
              <FieldPhotoGallery
                fieldId={activeField.id}
                photos={activeField.photos || []}
                onChange={(photos) => setSavedField((f) => (f ? { ...f, photos } : f))}
              />
            </>
          ) : (
            <Alert severity="info">יש לשמור את המגרש כדי להוסיף תמונות</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>סגור</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "שומר…" : isEdit || savedField ? "שמור שינויים" : "צור מגרש"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
