import type { MapCoordinate, MapRegion } from '@/components/map/types';

export function regionFromCoordinate(coordinate: MapCoordinate, delta = 0.1): MapRegion {
  return { ...coordinate, latitudeDelta: delta, longitudeDelta: delta };
}

/**
 * Where the create-game map opens, with no async work: the chosen field if it has coordinates,
 * else the cached device location, else the default region.
 */
export function resolveInitialMapRegion(
  selectedField: { lat?: number | null; lng?: number | null } | null | undefined,
  userLocation: MapCoordinate | null | undefined,
  fallback: MapRegion,
): MapRegion {
  if (selectedField && selectedField.lat != null && selectedField.lng != null) {
    return regionFromCoordinate({ latitude: selectedField.lat, longitude: selectedField.lng });
  }
  if (userLocation) return regionFromCoordinate(userLocation);
  return fallback;
}
