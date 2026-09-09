/** Finite WGS-84 pair — Google Maps panTo / AdvancedMarker throw on NaN or out-of-range. */
export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function asLatLngTuple(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);
  return isValidLatLng(lat, lng) ? [lat, lng] : null;
}

const PLACEHOLDER_CITY = /^(other city|unknown|n\/?a|test)$/i;

/** Drop non-strings and English placeholder cities from `/api/fields/cities`. */
export function sanitizeCityList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (c): c is string =>
      typeof c === "string" && c.trim().length > 0 && !PLACEHOLDER_CITY.test(c.trim())
  );
}
