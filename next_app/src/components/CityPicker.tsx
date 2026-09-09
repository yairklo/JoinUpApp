"use client";

// Unified city-selection control used by both the Home rail's "switch city"
// dialog (GamesByCityClient) and the /search map page's inline filters.
// Consolidates what used to be two independent implementations (a plain
// Autocomplete with no GPS, and a TextField `select` + a separate "my
// location" button) into one component so city aliasing/normalization and
// geolocation error handling only need to be gotten right once.
//
// Renders only the input controls (Autocomplete + optional GPS button) --
// callers keep their own wrapping layout (Dialog, filter Stack, etc.) so
// each call site's existing look is preserved.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import { fieldsApi } from "@/services/api/fields";
import { normalizeCity } from "@joinup/shared/cityAliases";

const ALL_CITIES_LABEL = "כל הערים";

export interface CityPickerHandle {
  /** Imperatively (re)trigger browser geolocation, e.g. from a "clear filters" action elsewhere on the page. */
  detectLocation: () => void;
}

export interface CityPickerProps {
  /** Normalized city name, or "" for "all cities" when `includeAllCitiesOption` is set. */
  value: string;
  onChange: (city: string) => void;
  /** Override the city list instead of fetching via fieldsApi.getCities(). */
  cities?: string[];
  /** Prepend a "כל הערים" option that reports back as value === "". */
  includeAllCitiesOption?: boolean;
  /** Show a "השתמש במיקום שלי" GPS button next to the Autocomplete. */
  allowGeolocation?: boolean;
  /** Auto-run geolocation once on mount (only meaningful with allowGeolocation). */
  detectOnMount?: boolean;
  onLocationDetected?: (coords: [number, number]) => void;
  /** Notified whenever the internal geolocation lookup starts/stops, so a parent that also needs the map loading state can stay in sync. */
  onLocatingChange?: (locating: boolean) => void;
  label?: string;
  placeholder?: string;
  size?: "small" | "medium";
  fullWidth?: boolean;
  autoFocus?: boolean;
  sx?: object;
}

const CityPicker = forwardRef<CityPickerHandle, CityPickerProps>(function CityPicker(
  {
    value,
    onChange,
    cities: citiesProp,
    includeAllCitiesOption = false,
    allowGeolocation = false,
    detectOnMount = false,
    onLocationDetected,
    onLocatingChange,
    label = "עיר",
    placeholder = "בחר עיר...",
    size = "small",
    fullWidth = false,
    autoFocus = false,
    sx,
  },
  ref
) {
  const [fetchedCities, setFetchedCities] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (citiesProp) return;
    fieldsApi.getCities().then(setFetchedCities).catch((err) => console.error("Failed to load cities", err));
  }, [citiesProp]);

  const cities = citiesProp ?? fetchedCities;
  const options = includeAllCitiesOption ? [ALL_CITIES_LABEL, ...cities] : cities;

  const setLocatingBoth = useCallback(
    (v: boolean) => {
      setLocating(v);
      onLocatingChange?.(v);
    },
    [onLocatingChange]
  );

  const detectLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError("הדפדפן הזה לא תומך באיתור מיקום אוטומטי");
      return;
    }
    if (!window.isSecureContext) {
      setLocationError("איתור מיקום פועל רק בחיבור מאובטח (HTTPS) — אפשר לבחור עיר ידנית");
      return;
    }
    setLocatingBoth(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingBoth(false);
        onLocationDetected?.([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        setLocatingBoth(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "שיתוף המיקום נחסם. כדי לאפשר, יש לאשר גישה למיקום להגדרות האתר בדפדפן — או לבחור עיר ידנית"
            : "לא הצלחנו לאתר את המיקום שלך. אפשר לבחור עיר ידנית"
        );
      },
      { timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLocationDetected, setLocatingBoth]);

  useImperativeHandle(ref, () => ({ detectLocation }), [detectLocation]);

  useEffect(() => {
    if (allowGeolocation && detectOnMount) detectLocation();
    // Only ever auto-run once on mount; the button/ref re-triggers it manually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `value` is always normalized to its canonical spelling (see onChange below), but `options`
  // is the raw, unnormalized city list from the DB -- it may only ever contain a non-canonical
  // alias (e.g. "תל אביב") and never the literal canonical string ("תל אביב-יפו"). Matching by
  // exact string equality would then show the field as blank despite a valid selection, so match
  // by normalized form instead and display whichever spelling actually exists in `options`.
  const displayValue = value
    ? (options.find((o) => normalizeCity(o) === normalizeCity(value)) ?? null)
    : (includeAllCitiesOption ? ALL_CITIES_LABEL : null);

  return (
    <Box sx={sx}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "stretch", sm: "center" }}
      >
        <Autocomplete
          options={options}
          value={displayValue}
          onChange={(_e, newValue) => {
            if (newValue === ALL_CITIES_LABEL) {
              onChange("");
            } else {
              onChange(newValue ? normalizeCity(newValue) : "");
            }
          }}
          renderInput={(params) => (
            <TextField {...params} label={label} placeholder={placeholder} autoFocus={autoFocus} />
          )}
          noOptionsText="לא נמצאו ערים"
          size={size}
          fullWidth={fullWidth}
          sx={{ minWidth: fullWidth ? undefined : 160, flex: fullWidth ? 1 : "0 0 auto" }}
        />
        {allowGeolocation && (
          <Button
            variant="outlined"
            size={size}
            onClick={detectLocation}
            disabled={locating}
            startIcon={locating ? <CircularProgress size={14} /> : <MyLocationIcon />}
            sx={{ borderRadius: 8, textTransform: "none", fontWeight: 600, flexShrink: 0 }}
          >
            השתמש במיקום שלי
          </Button>
        )}
      </Stack>
      {allowGeolocation && locationError && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {locationError}
        </Typography>
      )}
    </Box>
  );
});

export default CityPicker;
