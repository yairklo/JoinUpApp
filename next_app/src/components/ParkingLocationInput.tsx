"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LocalParkingRoundedIcon from "@mui/icons-material/LocalParkingRounded";
import { PARKING_PIN_COLOR } from "@/lib/parkingPin";

// The Google Maps picker is only needed once someone opens the parking section.
const FieldLocationPicker = dynamic(() => import("@/components/admin/FieldLocationPicker"), { ssr: false });

export const PARKING_NOTE_MAX_LENGTH = 140;

export interface ParkingValue {
  lat: number | null;
  lng: number | null;
  note: string;
}

export const EMPTY_PARKING: ParkingValue = { lat: null, lng: null, note: "" };

/**
 * Optional parking spot for a field: a pin picked on the map plus a short note. Collapsed
 * behind a button until someone wants it. The note is only sent together with a pin (see
 * parkingPayload), since on its own it has nothing to point at.
 */
export default function ParkingLocationInput({
  value,
  onChange,
  addressForGeocoding,
  disabled = false,
  fieldPosition,
}: {
  value: ParkingValue;
  onChange: (next: ParkingValue) => void;
  /** Lets "איתור לפי כתובת" drop the pin near the venue as a starting point. */
  addressForGeocoding: string;
  disabled?: boolean;
  /** The field's own pin, when known, so the parking map opens next to it. */
  fieldPosition?: { lat: number; lng: number } | null;
}) {
  const hasPin = value.lat != null && value.lng != null;
  const [open, setOpen] = useState(hasPin);
  const sectionId = useId();
  const expanded = open || hasPin;

  if (!expanded) {
    return (
      <Box>
        <Button
          type="button"
          size="small"
          variant="text"
          startIcon={<LocalParkingRoundedIcon fontSize="small" />}
          onClick={() => setOpen(true)}
          disabled={disabled}
          aria-expanded={false}
          aria-controls={sectionId}
          sx={{ minHeight: 44 }}
        >
          הוספת מיקום חניה (אופציונלי)
        </Button>
      </Box>
    );
  }

  return (
    <Stack id={sectionId} spacing={1.25} component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
      <Typography component="legend" variant="subtitle2" fontWeight={700} sx={{ p: 0 }}>
        חניה (אופציונלי)
      </Typography>
      <FieldLocationPicker
        lat={value.lat}
        lng={value.lng}
        addressForGeocoding={addressForGeocoding}
        onChange={(lat, lng) => onChange({ ...value, lat, lng })}
        label="מיקום החניה"
        unsetHint="(לחצו על המפה כדי לסמן)"
        pinColor={PARKING_PIN_COLOR}
        pinGlyph="P"
        fallbackCenter={fieldPosition}
        unavailableText="המפה לא זמינה כרגע, ולכן אי אפשר לסמן חניה."
      />
      <TextField
        label="הערה לחניה (אופציונלי)"
        placeholder="למשל: חניון חינם מאחורי האולם"
        size="small"
        fullWidth
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        disabled={disabled || !hasPin}
        helperText={hasPin ? `${value.note.length}/${PARKING_NOTE_MAX_LENGTH}` : "סמנו קודם את החניה על המפה"}
        slotProps={{ htmlInput: { maxLength: PARKING_NOTE_MAX_LENGTH, dir: "rtl" } }}
      />
      <Box>
        <Button
          type="button"
          size="small"
          color="inherit"
          onClick={() => {
            onChange(EMPTY_PARKING);
            setOpen(false);
          }}
          disabled={disabled}
          sx={{ minHeight: 44 }}
        >
          {hasPin ? "הסרת החניה" : "ביטול"}
        </Button>
      </Box>
    </Stack>
  );
}

/** Request fields for a create/suggest call: nothing at all when no pin was placed. */
export function parkingPayload(value: ParkingValue): { parkingLat?: number; parkingLng?: number; parkingNote?: string } {
  if (value.lat == null || value.lng == null) return {};
  const note = value.note.trim();
  return { parkingLat: value.lat, parkingLng: value.lng, ...(note ? { parkingNote: note } : {}) };
}
