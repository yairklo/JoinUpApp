export type MapCoordinate = {
    latitude: number;
    longitude: number;
};

export type MapRegion = MapCoordinate & {
    latitudeDelta: number;
    longitudeDelta: number;
};

export type MapBounds = {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
};

export interface MapMarkerItem<T = unknown> {
    id: string;
    latitude: number;
    longitude: number;
    payload: T;
}

export const DEFAULT_MAP_REGION: MapRegion = {
    latitude: 32.0853,
    longitude: 34.7818,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
};

export function regionToBounds(region: MapRegion): MapBounds {
    return {
        minLat: region.latitude - region.latitudeDelta / 2,
        maxLat: region.latitude + region.latitudeDelta / 2,
        minLng: region.longitude - region.longitudeDelta / 2,
        maxLng: region.longitude + region.longitudeDelta / 2,
    };
}
