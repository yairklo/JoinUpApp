export interface MapLocationInput {
  lat?: number | null;
  lng?: number | null;
  fieldLat?: number | null;
  fieldLng?: number | null;
  customLat?: number | null;
  customLng?: number | null;
  address?: string | null;
  fieldLocation?: string | null;
  customLocation?: string | null;
  name?: string | null;
  fieldName?: string | null;
}

export interface VenueMapInput {
  lat: number | null;
  lng: number | null;
  address: string | null;
  name: string | null;
}

export interface MapLinks {
  /** Coordinate pair, or the address/name that was encoded. */
  query: string;
  usedCoordinates: boolean;
  googleMapsUrl: string;
  wazeUrl: string;
  appleMapsUrl: string;
}

/** Null when the venue has no coordinates and no address or name. */
export function venueMapInput(venue: MapLocationInput | null | undefined): VenueMapInput | null;

/** Google Maps, Waze, and Apple Maps URLs. Null when there is nothing to open. */
export function buildMapLinks(venue: MapLocationInput | null | undefined): MapLinks | null;
