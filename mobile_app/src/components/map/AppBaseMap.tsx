import React, {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { View, ActivityIndicator, ScrollView, TouchableOpacity, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import ClusteredMapView from 'react-native-map-clustering';
// @ts-ignore
import SuperclusterClass from 'supercluster';
import SportClusterMarker from './SportClusterMarker';
import { SPORT_MAPPING } from '@/utils/sports';
import {
    DEFAULT_MAP_REGION,
    MapBounds,
    MapCoordinate,
    MapMarkerItem,
    MapRegion,
    regionToBounds,
} from './types';

const Supercluster = (SuperclusterClass as any)?.default || SuperclusterClass;

export type MapSportFilter = 'SOCCER' | 'BASKETBALL' | 'TENNIS' | null;

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
    clusterRadius?: number;
    clusteringEnabled?: boolean;
    clusterBySport?: boolean;
    onClusterPress?: (clusterInfo: {
        clusterId: number;
        sport: string;
        count: number;
        items: MapMarkerItem<T>[];
        coordinate: MapCoordinate;
    }) => void;
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
        clusterColor = '#059669',
        className,
        showSportFilter = false,
        clusterRadius = 24,
        clusteringEnabled = true,
        clusterBySport = false,
        onClusterPress,
    }: AppBaseMapProps<T>,
    ref: React.Ref<AppBaseMapHandle>
) {
    const { t } = useTranslation();
    const mapRef = useRef<any>(null);
    const [mapSportFilter, setMapSportFilter] = useState<MapSportFilter>(null);
    const [currentRegion, setCurrentRegion] = useState<MapRegion>(initialRegion);
    const [debouncedRegionForClustering, setDebouncedRegionForClustering] = useState<MapRegion>(initialRegion);
    const boundsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onBoundsChangeRef = useRef(onBoundsChange);
    onBoundsChangeRef.current = onBoundsChange;

    const animateToCoordinate = useCallback((coordinate: MapCoordinate, delta = 0.05) => {
        const targetRegion = {
            ...coordinate,
            latitudeDelta: delta,
            longitudeDelta: delta,
        };
        setCurrentRegion(targetRegion);
        setDebouncedRegionForClustering(targetRegion);
        mapRef.current?.animateToRegion(targetRegion, 500);
    }, []);

    const animateToRegion = useCallback((region: MapRegion, duration = 500) => {
        setCurrentRegion(region);
        setDebouncedRegionForClustering(region);
        mapRef.current?.animateToRegion(region, duration);
    }, []);

    useImperativeHandle(ref, () => ({
        animateToRegion,
        animateToCoordinate,
    }), [animateToCoordinate, animateToRegion]);

    const handleRegionChangeComplete = useCallback((region: MapRegion) => {
        setCurrentRegion(region);
        if (boundsTimeoutRef.current) clearTimeout(boundsTimeoutRef.current);
        boundsTimeoutRef.current = setTimeout(() => {
            setDebouncedRegionForClustering(region);
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

    // Stable per-item coordinate objects, rebuilt only when the underlying marker data
    // changes (not on every viewport update) — reused by both node-building paths below
    // so an unrelated recompute (e.g. debouncedRegionForClustering ticking) doesn't hand
    // React.memo'd marker components a fresh `coordinate` reference every time.
    const markerCoordinates = useMemo(() => {
        const map = new Map<string, MapCoordinate>();
        for (const item of visibleMarkers) {
            map.set(item.id, { latitude: item.latitude, longitude: item.longitude });
        }
        return map;
    }, [visibleMarkers]);

    const markerNodes = useMemo(() => {
        return visibleMarkers.map((item) => {
            const coordinate = markerCoordinates.get(item.id)!;
            const node = renderMarker({
                item,
                selected: selectedMarkerId === item.id,
                onPress: () => onMarkerPress?.(item.payload, item),
                animateToCoordinate: () => animateToCoordinate(coordinate),
            });
            if (!node) return null;
            // react-native-map-clustering only recognizes a child as clusterable when
            // `coordinate` is present on the element it was handed directly — our marker
            // components wrap their own <Marker> internally, so it never sees it there.
            return React.cloneElement(node as React.ReactElement<any>, { key: item.id, coordinate });
        });
    }, [visibleMarkers, markerCoordinates, selectedMarkerId, renderMarker, onMarkerPress, animateToCoordinate]);

    // Build and cache SuperCluster instances per sport whenever visibleMarkers changes
    const sportClusterIndexes = useMemo(() => {
        if (!clusterBySport) return null;

        const bySport = new Map<string, Array<any>>();
        const itemsMap = new Map<string, MapMarkerItem<T>>();

        for (const item of visibleMarkers) {
            itemsMap.set(item.id, item);
            // A marker spanning zero or more than one sport (e.g. a venue with courts of
            // different types grouped under one pin) gets its own neutral bucket instead
            // of being force-fit into one sport's colored cluster.
            const tags = item.sportTags || [];
            const sport = tags.length === 1 ? tags[0] : 'MIXED';
            if (!bySport.has(sport)) bySport.set(sport, []);
            bySport.get(sport)!.push({
                type: 'Feature' as const,
                geometry: {
                    type: 'Point' as const,
                    coordinates: [item.longitude, item.latitude],
                },
                properties: {
                    itemId: item.id,
                    sport,
                },
            });
        }

        const indexes = new Map<string, any>();
        for (const [sport, features] of bySport.entries()) {
            const sc = new (Supercluster as any)({
                radius: clusterRadius || 32,
                maxZoom: 18,
                minPoints: 2,
            });
            sc.load(features);
            indexes.set(sport, sc);
        }

        return { indexes, itemsMap };
    }, [clusterBySport, visibleMarkers, clusterRadius]);

    const handleClusterPress = useCallback((
        clusterId?: number,
        sport?: string,
        latitude?: number,
        longitude?: number
    ) => {
        if (clusterId == null || !sport || latitude == null || longitude == null) return;
        if (!sportClusterIndexes) return;

        const { indexes, itemsMap } = sportClusterIndexes;
        const index = indexes.get(sport);
        if (!index) return;

        const clusterLeaves = index.getLeaves(clusterId, 10, 0);
        const clusterItems: MapMarkerItem<T>[] = clusterLeaves
            .map((leaf: any) => itemsMap.get(leaf.properties.itemId))
            .filter(Boolean);

        if (clusterItems.length <= 4 && onClusterPress) {
            onClusterPress({
                clusterId,
                sport,
                count: clusterItems.length,
                items: clusterItems,
                coordinate: { latitude, longitude },
            });
            return;
        }

        const expZoom = index.getClusterExpansionZoom(clusterId);
        const currentDelta = debouncedRegionForClustering.latitudeDelta;
        const targetDelta = Math.min(
            currentDelta * 0.5,
            360 / Math.pow(2, expZoom)
        );
        animateToRegion(
            {
                latitude,
                longitude,
                latitudeDelta: targetDelta,
                longitudeDelta: targetDelta,
            },
            400
        );
    }, [sportClusterIndexes, onClusterPress, debouncedRegionForClustering.latitudeDelta, animateToRegion]);

    const sportClusteredNodes = useMemo(() => {
        if (!clusterBySport || !sportClusterIndexes) return null;

        const { indexes, itemsMap } = sportClusterIndexes;
        const deltaLng = Math.max(0.0001, Math.abs(debouncedRegionForClustering.longitudeDelta));
        const deltaLat = Math.max(0.0001, Math.abs(debouncedRegionForClustering.latitudeDelta));

        const bBox: [number, number, number, number] = [
            Math.max(-180, debouncedRegionForClustering.longitude - deltaLng * 1.5),
            Math.max(-85, debouncedRegionForClustering.latitude - deltaLat * 1.5),
            Math.min(180, debouncedRegionForClustering.longitude + deltaLng * 1.5),
            Math.min(85, debouncedRegionForClustering.latitude + deltaLat * 1.5),
        ];
        const zoom = Math.min(
            18,
            Math.max(1, Math.round(Math.log(360 / deltaLng) / Math.LN2))
        );

        const nodes: React.ReactElement[] = [];

        for (const [sport, index] of indexes.entries()) {
            const clusters = index.getClusters(bBox, zoom);
            for (const feature of clusters) {
                const [lng, lat] = feature.geometry.coordinates;
                if (feature.properties.cluster) {
                    const clusterId = `sport-cluster-${sport}-${feature.properties.cluster_id}`;
                    nodes.push(
                        <SportClusterMarker
                            key={clusterId}
                            id={clusterId}
                            clusterId={feature.properties.cluster_id}
                            sport={sport}
                            count={feature.properties.point_count}
                            latitude={lat}
                            longitude={lng}
                            onPress={handleClusterPress}
                        />
                    );
                } else {
                    const item = itemsMap.get(feature.properties.itemId);
                    if (!item) continue;
                    const coordinate = markerCoordinates.get(item.id)!;
                    const node = renderMarker({
                        item,
                        selected: selectedMarkerId === item.id,
                        onPress: () => onMarkerPress?.(item.payload, item),
                        animateToCoordinate: () => animateToCoordinate(coordinate),
                    });
                    if (node) {
                        nodes.push(React.cloneElement(node as React.ReactElement<any>, { key: item.id, coordinate }));
                    }
                }
            }
        }

        return nodes;
    }, [
        clusterBySport,
        sportClusterIndexes,
        markerCoordinates,
        debouncedRegionForClustering,
        selectedMarkerId,
        renderMarker,
        onMarkerPress,
        animateToCoordinate,
        handleClusterPress,
    ]);

    // react-native-map-clustering rebuilds its internal supercluster state (and, with
    // clusteringEnabled=false, resets markers/spider state to empty) in a useEffect keyed
    // on its own `children` prop reference. JSX `{a}{b}` children are a fresh array on
    // every render of this component regardless of whether `a`/`b` themselves changed, so
    // an unrelated re-render (e.g. the `loading` prop flipping while fetching more courts)
    // was making the library tear down and rebuild its cluster state every time — freezing
    // pan/zoom while `mapLoading` toggled. Memoizing the actual children keeps that prop
    // referentially stable when nothing marker-related changed.
    const mapChildren = useMemo(
        () => (
            <>
                {clusterBySport ? sportClusteredNodes : markerNodes}
                {overlayChildren}
            </>
        ),
        [clusterBySport, sportClusteredNodes, markerNodes, overlayChildren]
    );

    const containerClass =
        className ||
        (variant === 'embedded'
            ? 'flex-1 mt-2 mx-2 mb-2 rounded-3xl overflow-hidden shadow-sm border border-gray-200 relative'
            : 'flex-1 relative');

    return (
        <>
            <View className={containerClass}>
                {loading && (
                    <View
                        pointerEvents="none"
                        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white p-2 rounded-full shadow-lg"
                    >
                        <ActivityIndicator size="small" color="#059669" />
                    </View>
                )}
                {showSportFilter && (
                    <View className="absolute top-3 left-3 right-3 z-10">
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 2 }}
                        >
                            {([
                                { id: null, label: t('sports.all', 'הכל') },
                                { id: 'SOCCER', label: t('sports.soccer', SPORT_MAPPING.SOCCER) },
                                { id: 'BASKETBALL', label: t('sports.basketball', SPORT_MAPPING.BASKETBALL) },
                                { id: 'TENNIS', label: t('sports.tennis', SPORT_MAPPING.TENNIS) },
                            ] as Array<{ id: MapSportFilter; label: string }>).map((chip) => {
                                const isActive = mapSportFilter === chip.id;
                                return (
                                    <TouchableOpacity
                                        key={chip.id ?? 'all'}
                                        onPress={() => setMapSportFilter(chip.id)}
                                        className={`mr-2 px-3 py-1.5 rounded-full border shadow-sm ${
                                            isActive
                                                ? 'bg-brand border-brand'
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
                    radius={clusterRadius}
                    clusteringEnabled={clusterBySport ? false : clusteringEnabled}
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
                    {mapChildren}
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
