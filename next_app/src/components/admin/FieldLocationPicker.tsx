"use client";

import { useCallback, useMemo, useState } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap, type MapMouseEvent } from "@vis.gl/react-google-maps";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import CircularProgress from "@mui/material/CircularProgress";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Tel Aviv -- a reasonable default center for a new field with no address-based
// hint yet. Only used until the admin geocodes an address or clicks the map.
const DEFAULT_CENTER = { lat: 32.0853, lng: 34.7818 };

interface FieldLocationPickerProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  addressForGeocoding: string; // built from name/street/city -- best-effort, client-side only
  onChange: (lat: number, lng: number) => void;
}

// Drag-to-place picker + "locate by address" button. Both use the browser's
// own google.maps JS APIs (Geocoder, draggable AdvancedMarker) through the
// same client-side API key already proven to work for the read-only display
// maps elsewhere (GameLocationMap.tsx) -- no server-side geocoding key or
// quota is needed, and no new credentials for the user to provision.
function PickerInner({ lat, lng, addressForGeocoding, onChange }: FieldLocationPickerProps) {
  const map = useMap();
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const hasPosition = lat != null && lng != null;
  const position = useMemo(() => (hasPosition ? { lat: lat as number, lng: lng as number } : DEFAULT_CENTER), [lat, lng, hasPosition]);

  // Map's own onClick uses this library's MapMouseEvent (a wrapper: the real
  // coordinates are a plain {lat, lng} literal under `.detail.latLng`) --
  // NOT the same shape as google.maps.MapMouseEvent below.
  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      const latLng = e.detail.latLng;
      if (!latLng) return;
      onChange(latLng.lat, latLng.lng);
    },
    [onChange]
  );

  // AdvancedMarker's onDragEnd, by contrast, hands back the raw
  // google.maps.MapMouseEvent, whose `.latLng` is a google.maps.LatLng
  // object with .lat()/.lng() *methods*, not plain number properties.
  const handleMarkerDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      onChange(e.latLng.lat(), e.latLng.lng());
    },
    [onChange]
  );

  const handleGeocode = useCallback(async () => {
    if (!addressForGeocoding.trim()) {
      setGeocodeError("יש למלא כתובת (שם/רחוב/עיר) לפני איתור אוטומטי");
      return;
    }
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const geocoder = new google.maps.Geocoder();
      const result = await geocoder.geocode({ address: addressForGeocoding, region: "il" });
      const first = result.results[0];
      if (!first) {
        setGeocodeError("לא נמצאה כתובת תואמת. אפשר לסמן ידנית על המפה");
        return;
      }
      const location = first.geometry.location;
      onChange(location.lat(), location.lng());
      map?.panTo({ lat: location.lat(), lng: location.lng() });
      map?.setZoom(16);
    } catch (e) {
      setGeocodeError("איתור הכתובת נכשל. אפשר לסמן ידנית על המפה");
    } finally {
      setGeocoding(false);
    }
  }, [addressForGeocoding, map, onChange]);

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="body2" color="text.secondary">
          מיקום במפה {!hasPosition && "(לא הוגדר — המגרש לא יופיע בחיפוש לפי מפה)"}
        </Typography>
        <Button
          size="small"
          startIcon={geocoding ? <CircularProgress size={14} /> : <MyLocationIcon />}
          onClick={handleGeocode}
          disabled={geocoding}
        >
          איתור לפי כתובת
        </Button>
      </Box>
      {geocodeError && (
        <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setGeocodeError(null)}>
          {geocodeError}
        </Alert>
      )}
      <Box width="100%" height={220} borderRadius={1} overflow="hidden">
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={position}
          defaultZoom={hasPosition ? 16 : 8}
          gestureHandling="greedy"
          disableDefaultUI={false}
          onClick={handleMapClick}
          style={{ width: "100%", height: "100%" }}
        >
          {hasPosition && (
            <AdvancedMarker position={position} draggable onDragEnd={handleMarkerDragEnd}>
              <Pin background="#059669" borderColor="#047857" glyphColor="#fff" />
            </AdvancedMarker>
          )}
        </Map>
      </Box>
      <Typography variant="caption" color="text.secondary">
        ניתן ללחוץ על המפה או לגרור את הסמן כדי לדייק את המיקום.
      </Typography>
    </Box>
  );
}

export default function FieldLocationPicker(props: FieldLocationPickerProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Alert severity="info">
        מפה לא זמינה כרגע — ניתן עדיין לשמור את המגרש, אך הוא לא יופיע בחיפוש לפי מפה עד שיוגדר מיקום.
      </Alert>
    );
  }
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} language="he">
      <PickerInner {...props} />
    </APIProvider>
  );
}
