import React, {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
} from 'react';
import { View, ActivityIndicator } from 'react-native';
import ClusteredMapView from 'react-native-map-clustering';
import {
    DEFAULT_MAP_REGION,
    MapBounds,
    MapCoordinate,
    MapMarkerItem,
    MapRegion,
    regionToBounds,
} from './types';

export interface MapMarkerRenderContext<T> {
    item: MapMarkerItem<T>;
    selected: boolean;
    onPress: () => void;
    animateToCoordinate: (coordinate: MapCoordinate) => void;
}

export interface AppBaseMapHandle {
    animateToRegion: (region: MapRegion, duration?: number) => void;
    animateToCoordinate: (coordinate: MapCoordinate, delta?: number) => void;
}

export interface AppBaseMapProps<T> {
    markers: MapMarkerItem<T>[];
    renderMarker: (context: MapMarkerRenderContext<T>) => React.ReactElement | null;
    selectedMarkerId?: string | null;
    onMarkerPress?: (payload: T, item: MapMarkerItem<T>) => void;
    onMapPress?: (coordinate: MapCoordinate) => void;
    onBoundsChange?: (bounds: MapBounds, region: MapRegion) => void;
    boundsDebounceMs?: number;
    overlayChildren?: React.ReactNode;
    bottomSheet?: React.ReactNode;
    loading?: boolean;
    initialRegion?: MapRegion;
    variant?: 'embedded' | 'fill';
    clusterColor?: string;
    className?: string;
}

function AppBaseMapInner<T>(
    {
        markers,
        renderMarker,
        selectedMarkerId = null,
        onMarkerPress,
        onMapPress,
        onBoundsChange,
        boundsDebounceMs = 300,
        overlayChildren,
        bottomSheet,
        loading = false,
        initialRegion = DEFAULT_MAP_REGION,
        variant = 'embedded',
        clusterColor = '#2563eb',
        className,
    }: AppBaseMapProps<T>,
    ref: React.Ref<AppBaseMapHandle>
) {
    const mapRef = useRef<any>(null);
    const boundsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onBoundsChangeRef = useRef(onBoundsChange);
    onBoundsChangeRef.current = onBoundsChange;

    const animateToCoordinate = useCallback((coordinate: MapCoordinate, delta = 0.05) => {
        mapRef.current?.animateToRegion(
            {
                ...coordinate,
                latitudeDelta: delta,
                longitudeDelta: delta,
            },
            500
        );
    }, []);

    const animateToRegion = useCallback((region: MapRegion, duration = 500) => {
        mapRef.current?.animateToRegion(region, duration);
    }, []);

    useImperativeHandle(ref, () => ({
        animateToRegion,
        animateToCoordinate,
    }), [animateToCoordinate, animateToRegion]);

    const handleRegionChangeComplete = useCallback((region: MapRegion) => {
        if (!onBoundsChangeRef.current) return;
        if (boundsTimeoutRef.current) clearTimeout(boundsTimeoutRef.current);
        boundsTimeoutRef.current = setTimeout(() => {
            onBoundsChangeRef.current?.(regionToBounds(region), region);
        }, boundsDebounceMs);
    }, [boundsDebounceMs]);

    const markerNodes = useMemo(() => {
        return markers.map((item) => {
            const coordinate = { latitude: item.latitude, longitude: item.longitude };
            return renderMarker({
                item,
                selected: selectedMarkerId === item.id,
                onPress: () => onMarkerPress?.(item.payload, item),
                animateToCoordinate: () => animateToCoordinate(coordinate),
            });
        });
    }, [markers, selectedMarkerId, renderMarker, onMarkerPress, animateToCoordinate]);

    const containerClass =
        className ||
        (variant === 'embedded'
            ? 'flex-1 mt-2 mx-2 mb-2 rounded-3xl overflow-hidden shadow-sm border border-gray-200 relative'
            : 'flex-1 relative');

    return (
        <>
            <View className={containerClass}>
                {loading && (
                    <View className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white p-2 rounded-full shadow-lg">
                        <ActivityIndicator size="small" color="#2563eb" />
                    </View>
                )}
                <ClusteredMapView
                    ref={mapRef}
                    style={{ flex: 1 }}
                    showsUserLocation
                    showsMyLocationButton
                    clusterColor={clusterColor}
                    radius={48}
                    minZoom={1}
                    maxZoom={20}
                    initialRegion={initialRegion}
                    onRegionChangeComplete={handleRegionChangeComplete}
                    onPress={
                        onMapPress
                            ? (event) => onMapPress(event.nativeEvent.coordinate)
                            : undefined
                    }
                >
                    {markerNodes}
                    {overlayChildren}
                </ClusteredMapView>
            </View>
            {bottomSheet}
        </>
    );
}

const AppBaseMap = forwardRef(AppBaseMapInner) as <T>(
    props: AppBaseMapProps<T> & { ref?: React.Ref<AppBaseMapHandle> }
) => React.ReactElement;

export default AppBaseMap;
