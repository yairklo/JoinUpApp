"use client";

// Unified city-selection control used by both the Home rail's "switch city"
// dialog (GamesByCityClient) and the /search map page's inline filters.

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
import { isValidLatLng, sanitizeCityList } from "@/utils/geo";

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
  /**
   * Auto-run geolocation once on mount. Only fires if the Permissions API
   * already reports `granted` — prompting on first paint throws or is ignored
   * on many mobile browsers (no user gesture) and was taking down /search.
   */
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

function failLocationMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err && typeof (err as GeolocationPositionError).code === "number"
      ? (err as GeolocationPositionError).code
      : undefined;
  if (code === 1) {
    return "שיתוף המיקום נחסם. כדי לאפשר, יש לאשר גישה למיקום בהגדרות האתר בדפדפן — או לבחור עיר ידנית";
  }
  return "לא הצלחנו לאתר את המיקום שלך. אפשר לבחור עיר ידנית";
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
    placeholder = "בחרו עיר…",
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
    fieldsApi
      .getCities()
      .then((res) => setFetchedCities(sanitizeCityList(res)))
      .catch((err) => {
        console.error("Failed to load cities", err);
        setFetchedCities([]);
      });
  }, [citiesProp]);

  const cities = sanitizeCityList(citiesProp ?? fetchedCities);
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
      setLocatingBoth(false);
      setLocationError("הדפדפן הזה לא תומך באיתור מיקום אוטומטי");
      return;
    }
    if (!window.isSecureContext) {
      setLocatingBoth(false);
      setLocationError("איתור מיקום פועל רק בחיבור מאובטח (HTTPS) — אפשר לבחור עיר ידנית");
      return;
    }

    setLocatingBoth(true);
    setLocationError(null);

    // Some mobile browsers / in-app WebViews throw synchronously (Permissions-Policy,
    // missing user gesture, SecurityError) instead of invoking the error callback.
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocatingBoth(false);
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (!isValidLatLng(lat, lng)) {
            setLocationError("לא הצלחנו לאתר את המיקום שלך. אפשר לבחור עיר ידנית");
            return;
          }
          onLocationDetected?.([lat, lng]);
        },
        (err) => {
          setLocatingBoth(false);
          setLocationError(failLocationMessage(err));
        },
        { timeout: 10000, maximumAge: 60_000 }
      );
    } catch (e) {
      console.warn("[CityPicker] geolocation threw:", e);
      setLocatingBoth(false);
      setLocationError("לא הצלחנו לאתר את המיקום שלך. אפשר לבחור עיר ידנית");
    }
  }, [onLocationDetected, setLocatingBoth]);

  useImperativeHandle(ref, () => ({ detectLocation }), [detectLocation]);

  useEffect(() => {
    if (!allowGeolocation || !detectOnMount) return;
    let cancelled = false;

    const skipAuto = () => {
      if (!cancelled) setLocatingBoth(false);
    };

    // Never prompt on first paint. Auto-center only when permission is already
    // granted (desktop users who allowed it before). Mobile Safari often rejects
    // permissions.query({name:'geolocation'}) — treat that as "don't auto-prompt".
    const maybeAutoDetect = async () => {
      try {
        const query = navigator.permissions?.query;
        if (typeof query !== "function") {
          skipAuto();
          return;
        }
        const status = await query.call(navigator.permissions, { name: "geolocation" as PermissionName });
        if (cancelled) return;
        if (status.state === "granted") detectLocation();
        else skipAuto();
      } catch {
        skipAuto();
      }
    };

    void maybeAutoDetect();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
