import React, {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { View, ActivityIndicator, ScrollView, TouchableOpacity, Text } from 'react-native';
import ClusteredMapView from 'react-native-map-clustering';
import { SPORT_MAPPING } from '@/utils/sports';
import {
    DEFAULT_MAP_REGION,
    MapBounds,
    MapCoordinate,
    MapMarkerItem,
    MapRegion,
    regionToBounds,
} from './types';

export type MapSportFilter = 'SOCCER' | 'BASKETBALL' | 'TENNIS' | null;

const MAP_SPORT_FILTER_CHIPS: { id: MapSportFilter; label: string }[] = [
    { id: null, label: 'הכל' },
    { id: 'SOCCER', label: SPORT_MAPPING.SOCCER },
    { id: 'BASKETBALL', label: SPORT_MAPPING.BASKETBALL },
    { id: 'TENNIS', label: SPORT_MAPPING.TENNIS },
];

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
    showSportFilter?: boolean;
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
        showSportFilter = false,
    }: AppBaseMapProps<T>,
    ref: React.Ref<AppBaseMapHandle>
) {
    const mapRef = useRef<any>(null);
    const [mapSportFilter, setMapSportFilter] = useState<MapSportFilter>(null);
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

    const visibleMarkers = useMemo(() => {
        if (!showSportFilter || !mapSportFilter) return markers;
        return markers.filter((item) => {
            const tags = item.sportTags || [];
            if (tags.length === 0) return false;
            return tags.includes(mapSportFilter);
        });
    }, [markers, mapSportFilter, showSportFilter]);

    const markerNodes = useMemo(() => {
        return visibleMarkers.map((item) => {
            const coordinate = { latitude: item.latitude, longitude: item.longitude };
            return renderMarker({
                item,
                selected: selectedMarkerId === item.id,
                onPress: () => onMarkerPress?.(item.payload, item),
                animateToCoordinate: () => animateToCoordinate(coordinate),
            });
        });
    }, [visibleMarkers, selectedMarkerId, renderMarker, onMarkerPress, animateToCoordinate]);

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
                {showSportFilter && (
                    <View className="absolute top-3 left-3 right-3 z-10">
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 2 }}
                        >
                            {MAP_SPORT_FILTER_CHIPS.map((chip) => {
                                const isActive = mapSportFilter === chip.id;
                                return (
                                    <TouchableOpacity
                                        key={chip.id ?? 'all'}
                                        onPress={() => setMapSportFilter(chip.id)}
                                        className={`mr-2 px-3 py-1.5 rounded-full border shadow-sm ${
                                            isActive
                                                ? 'bg-blue-600 border-blue-600'
                                                : 'bg-white/95 border-gray-200'
                                        }`}
                                    >
                                        <Text
                                            className={`text-xs font-bold ${
                                                isActive ? 'text-white' : 'text-gray-700'
                                            }`}
                                        >
                                            {chip.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
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
