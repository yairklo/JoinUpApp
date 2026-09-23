"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import SearchIcon from "@mui/icons-material/Search";

type AddressOption = {
  key: string;
  label: string;
  /** Present for geocoder results; Places predictions resolve their location on selection. */
  location?: { lat: number; lng: number };
  prediction?: google.maps.places.PlacePrediction;
};

interface MapAddressSearchProps {
  /** Called with the chosen address's coordinates after the map has moved there. */
  onLocate?: (pt: { lat: number; lng: number }, label: string) => void;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

// "חפש כתובת…" box overlaid on a location-picker map. Suggestions come from Places
// Autocomplete when the key has the Places API enabled; if it doesn't (or the library fails to
// load), it falls back to the Geocoding API -- the same client geocoder the admin
// FieldLocationPicker already relies on. Must render inside an <APIProvider> with one <Map>.
export default function MapAddressSearch({ onLocate }: MapAddressSearchProps) {
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geocodingLib = useMapsLibrary("geocoding");

  const [input, setInput] = useState("");
  const [options, setOptions] = useState<AddressOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const placesUnavailableRef = useRef(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = input.trim();
    setNotFound(false);
    if (query.length < MIN_QUERY_LENGTH) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      if (requestId !== requestIdRef.current) return; // superseded by newer input
      setOptions(results);
      setNotFound(results.length === 0);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // fetchSuggestions only reads the libraries, which are listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, placesLib, geocodingLib]);

  async function fetchSuggestions(query: string): Promise<AddressOption[]> {
    if (placesLib && !placesUnavailableRef.current) {
      try {
        if (!sessionTokenRef.current) sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        const { suggestions } = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          language: "he",
          region: "il",
          includedRegionCodes: ["il"],
          sessionToken: sessionTokenRef.current,
        });
        return suggestions
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => !!p)
          .slice(0, 6)
          .map((p) => ({ key: p.placeId, label: p.text.text, prediction: p }));
      } catch (e) {
        // Most likely the Places API isn't enabled for this key -- stop trying it for this
        // session and use the geocoder instead.
        console.warn("[MapAddressSearch] Places autocomplete unavailable, falling back to geocoder:", e);
        placesUnavailableRef.current = true;
      }
    }
    if (!geocodingLib) return [];
    try {
      const { results } = await new geocodingLib.Geocoder().geocode({ address: query, region: "il", language: "he" });
      return results.slice(0, 6).map((r) => ({
        key: r.place_id,
        label: r.formatted_address,
        location: { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() },
      }));
    } catch {
      // ZERO_RESULTS rejects too -- treat any failure as "nothing found".
      return [];
    }
  }

  async function resolveLocation(option: AddressOption): Promise<{ lat: number; lng: number } | null> {
    if (option.location) return option.location;
    if (!option.prediction) return null;
    try {
      const place = option.prediction.toPlace();
      await place.fetchFields({ fields: ["location"] });
      sessionTokenRef.current = null; // a session ends with the place-details request
      const loc = place.location;
      return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
    } catch (e) {
      console.warn("[MapAddressSearch] Failed to resolve place location:", e);
      return null;
    }
  }

  const handleSelect = async (option: AddressOption | null) => {
    if (!option || !map) return;
    const loc = await resolveLocation(option);
    if (!loc) {
      setNotFound(true);
      return;
    }
    map.panTo(loc);
    map.setZoom(16);
    onLocate?.(loc, option.label);
  };

  return (
    <Paper
      elevation={3}
      sx={{ position: "absolute", top: 10, insetInlineStart: 10, insetInlineEnd: 60, zIndex: 2, maxWidth: 420, borderRadius: 2 }}
    >
      <Autocomplete<AddressOption, false, false, false>
        options={options}
        filterOptions={(x) => x}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.key === b.key}
        inputValue={input}
        onInputChange={(_e, value, reason) => {
          if (reason !== "reset") setInput(value);
        }}
        onChange={(_e, value) => {
          void handleSelect(value);
        }}
        loading={loading}
        loadingText="מחפש…"
        noOptionsText={notFound ? "לא נמצאה כתובת" : "הקלידו כתובת"}
        blurOnSelect
        size="small"
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="חפש כתובת…"
            dir="rtl"
            slotProps={{
              input: {
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        slotProps={{ popper: { dir: "rtl" } as object }}
      />
    </Paper>
  );
}
