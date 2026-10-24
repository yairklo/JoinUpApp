// External-map URLs for a field or venue. Shared by next_app and mobile_app.
// Coordinates win over a text query. A custom pin (the meeting point someone
// dropped on the map) wins over the catalog field's coordinates.

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Both ends must be finite and in range. A missing or out-of-range half is not a pin. */
function coordPair(lat, lng) {
  const la = finiteNumber(lat);
  const ln = finiteNumber(lng);
  if (la === null || ln === null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize a venue into the inputs the URL builder encodes.
 * Text fallback, used only when there is no pin: customLocation, then
 * address / fieldLocation, then the venue name.
 * @param {object | null | undefined} venue
 * @returns {{ lat: number | null, lng: number | null, address: string | null, name: string | null } | null}
 */
function venueMapInput(venue) {
  if (!venue || typeof venue !== 'object') return null;
  const custom = coordPair(venue.customLat, venue.customLng);
  const field = coordPair(
    venue.lat != null ? venue.lat : venue.fieldLat,
    venue.lng != null ? venue.lng : venue.fieldLng,
  );
  const coords = custom || field;
  const address = text(venue.customLocation) || text(venue.address) || text(venue.fieldLocation);
  const name = text(venue.name) || text(venue.fieldName);
  if (!coords && !address && !name) return null;
  return {
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    address: address || null,
    name: name || null,
  };
}

/**
 * Google Maps, Waze, and Apple Maps URLs for a venue.
 * Returns null when there is no coordinate pair and no address or name.
 * @param {object | null | undefined} venue
 * @returns {{ query: string, usedCoordinates: boolean, googleMapsUrl: string, wazeUrl: string, appleMapsUrl: string } | null}
 */
function buildMapLinks(venue) {
  const input = venueMapInput(venue);
  if (!input) return null;
  const { lat, lng, address, name } = input;
  const usedCoordinates = lat != null && lng != null;
  const query = usedCoordinates ? `${lat},${lng}` : (address || name);
  const encoded = encodeURIComponent(query);
  const label = encodeURIComponent(name || address || query);
  const googleMapsUrl = usedCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  // Open the place. navigate=yes would start turn-by-turn, which is a different action.
  const wazeUrl = usedCoordinates
    ? `https://waze.com/ul?ll=${lat},${lng}`
    : `https://waze.com/ul?q=${encoded}`;
  const appleMapsUrl = usedCoordinates
    ? `http://maps.apple.com/?ll=${lat},${lng}&q=${label}`
    : `http://maps.apple.com/?q=${encoded}`;
  return { query, usedCoordinates, googleMapsUrl, wazeUrl, appleMapsUrl };
}

module.exports = { venueMapInput, buildMapLinks };
