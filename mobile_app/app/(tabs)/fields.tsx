import { View, Text, TouchableOpacity, TextInput, Image, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { fieldsApi, Field } from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';
import FavoriteButton from '@/components/FavoriteButton';
import FilterPill from '@/components/FilterPill';
import AppBaseMap, { AppBaseMapHandle, MapMarkerRenderContext } from '@/components/map/AppBaseMap';
import FieldMapMarker from '@/components/map/FieldMapMarker';
import { MapBounds, MapMarkerItem, MapCoordinate, regionToBounds, DEFAULT_MAP_REGION } from '@/components/map/types';
import { getFieldSportTags, getSportColorHex, getSportIconName } from '@/utils/mapSport';
import { SPORT_KEYS, SPORT_MAPPING, SPORT_EMOJI } from '@/utils/sports';
import { isAbortError } from '@/utils/apiErrors';

const PAGE_SIZE = 24;

type SportFilter = string; // 'ALL' or one of SPORT_KEYS

/** Groups courts that sit at the exact same coordinates (a multi-court venue) under one key. */
function coordKey(lat: number, lng: number): string {
    return `${lat},${lng}`;
}

/** Expands a bounding box by a multiplier so surrounding courts are preloaded */
function expandBounds(bounds: MapBounds, factor = 2.0): MapBounds {
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.04);
    const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.04);
    const latPad = (latSpan * (factor - 1)) / 2;
    const lngPad = (lngSpan * (factor - 1)) / 2;
    return {
        minLat: Math.max(-90, Number((bounds.minLat - latPad).toFixed(6))),
        maxLat: Math.min(90, Number((bounds.maxLat + latPad).toFixed(6))),
        minLng: Math.max(-180, Number((bounds.minLng - lngPad).toFixed(6))),
        maxLng: Math.min(180, Number((bounds.maxLng + lngPad).toFixed(6))),
    };
}

export default function FieldsDirectoryScreen() {
    const { t } = useTranslation();
    const router = useRouter();

    // View mode: map view or list view
    const [isMapView, setIsMapView] = useState(true);

    // List view state
    const [fields, setFields] = useState<Field[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Map view state (accumulates courts as user pans or searches)
    const [mapFields, setMapFields] = useState<Field[]>([]);
    const [mapBounds, setMapBounds] = useState<MapBounds>(() => regionToBounds(DEFAULT_MAP_REGION));
    const [mapLoading, setMapLoading] = useState(false);
    const [selectedMapField, setSelectedMapField] = useState<Field | null>(null);
    const [selectedClusterFields, setSelectedClusterFields] = useState<Field[] | null>(null);
    const [clusterFieldIndex, setClusterFieldIndex] = useState(0);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    const mapRef = useRef<AppBaseMapHandle>(null);
    const mapAbortRef = useRef<AbortController | null>(null);
    const mapFetchSeqRef = useRef(0);

    // Filter states
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [sportFilter, setSportFilter] = useState<SportFilter>('ALL');

    const filters = useMemo(() => [
        { label: t('sports.all', 'הכל'), value: 'ALL' as SportFilter },
        ...SPORT_KEYS.map((key) => ({
            label: t('sports.' + key.toLowerCase(), SPORT_MAPPING[key]),
            value: key as SportFilter,
        })),
    ], [t]);

    // Bumped on every fetch-from-scratch so a slow, superseded search request
    // can't clobber state after a newer one already landed.
    const requestSeq = useRef(0);

    // Debounce query to avoid spamming the server on fast typing
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
        return () => clearTimeout(timer);
    }, [query]);

    // Fetch courts for a given bounding box (always sends minLat, maxLat, minLng, maxLng)
    const fetchMapFields = useCallback(async (bounds: MapBounds) => {
        const expanded = expandBounds(bounds, 2.0);
        setMapLoading(true);
        try {
            const results = await fieldsApi.searchMap(expanded, {
                q: debouncedQuery,
                sport: sportFilter,
            });
            const valid = results.filter((f) => f.lat != null && f.lng != null);

            // Merge newly discovered fields into the map cache so courts in already viewed areas don't vanish
            setMapFields((prev) => {
                const map = new Map<string, Field>();
                for (const f of prev) map.set(f.id, f);
                for (const f of valid) map.set(f.id, f);
                return Array.from(map.values());
            });
        } catch (error: any) {
            if (isAbortError(error)) return;
            console.error('Failed to load map fields', error);
        } finally {
            setMapLoading(false);
        }
    }, [debouncedQuery, sportFilter]);

    // Initial fetch on mount with default bounds
    useEffect(() => {
        fetchMapFields(mapBounds);
    }, [fetchMapFields]);

    // Handle map viewport / bounds change
    const handleMapBoundsChange = useCallback((bounds: MapBounds) => {
        setMapBounds(bounds);
        fetchMapFields(bounds);
    }, [fetchMapFields]);

    // Request user location on mount and center map + update bounds
    useEffect(() => {
        let isMounted = true;
        const requestLocation = async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted' && isMounted) {
                    const loc = await Location.getCurrentPositionAsync({});
                    if (!isMounted) return;
                    setUserLocation(loc.coords);
                    const userRegion = {
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        latitudeDelta: 0.1,
                        longitudeDelta: 0.1,
                    };
                    const bounds = regionToBounds(userRegion);
                    setMapBounds(bounds);
                    fetchMapFields(bounds);
                    mapRef.current?.animateToRegion(userRegion);
                }
            } catch (error) {
                console.error('Location permission error', error);
            }
        };
        requestLocation();
        return () => {
            isMounted = false;
        };
    }, [fetchMapFields]);

    // Fetch paginated fields for list view & support global search across all regions
    const fetchPage = useCallback(async (skip: number, append: boolean) => {
        const seq = ++requestSeq.current;
        if (append) setLoadingMore(true); else setLoading(true);
        try {
            const page = await fieldsApi.getPage({ take: PAGE_SIZE, skip, q: debouncedQuery, sport: sportFilter });
            if (seq !== requestSeq.current) return;
            setFields((prev) => (append ? [...prev, ...page.items] : page.items));
            setHasMore(page.hasMore);

            // If user searched for a specific court, add any matched courts with coords to map and center on the first match
            if (debouncedQuery && page.items.length > 0) {
                const withCoords = page.items.filter((f) => f.lat != null && f.lng != null);
                if (withCoords.length > 0) {
                    setMapFields((prev) => {
                        const map = new Map<string, Field>();
                        for (const f of prev) map.set(f.id, f);
                        for (const f of withCoords) map.set(f.id, f);
                        return Array.from(map.values());
                    });
                    if (!append) {
                        mapRef.current?.animateToRegion({
                            latitude: withCoords[0].lat!,
                            longitude: withCoords[0].lng!,
                            latitudeDelta: 0.05,
                            longitudeDelta: 0.05,
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load fields', e);
        } finally {
            if (seq === requestSeq.current) {
                if (append) setLoadingMore(false); else setLoading(false);
            }
        }
    }, [debouncedQuery, sportFilter]);

    // Re-fetch list on filter change
    useEffect(() => {
        fetchPage(0, false);
    }, [fetchPage]);

    const loadMore = () => {
        if (loading || loadingMore || !hasMore) return;
        fetchPage(fields.length, true);
    };

    // Filter map markers in real-time on the client (0ms latency response). Courts at the
    // exact same coordinates (a multi-court venue) are grouped under one marker — same
    // technique search.tsx already uses to group games by location — so e.g. a soccer
    // pitch and a basketball court sharing one spot don't render as two overlapping pins.
    const mapMarkers = useMemo<MapMarkerItem<Field[]>[]>(() => {
        const filtered = mapFields.filter((field) => {
            if (field.lat == null || field.lng == null) return false;
            if (sportFilter !== 'ALL') {
                const tags = getFieldSportTags(field);
                if (!tags.includes(sportFilter)) return false;
            }
            if (debouncedQuery) {
                const q = debouncedQuery.toLowerCase();
                const matchName = field.name?.toLowerCase().includes(q);
                const matchCity = field.city?.toLowerCase().includes(q);
                const matchLoc = field.location?.toLowerCase().includes(q);
                if (!matchName && !matchCity && !matchLoc) return false;
            }
            return true;
        });

        const groups = new Map<string, Field[]>();
        for (const field of filtered) {
            const key = coordKey(field.lat!, field.lng!);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(field);
        }

        return Array.from(groups.entries()).map(([key, group]) => ({
            id: key,
            latitude: group[0].lat!,
            longitude: group[0].lng!,
            payload: group,
            sportTags: Array.from(new Set(group.flatMap((f) => getFieldSportTags(f)))),
        }));
    }, [mapFields, sportFilter, debouncedQuery]);

    // Shared by a direct tap and a cluster tap: shows the switcher card when there's more
    // than one court at the spot, otherwise just the single court's preview.
    const openFieldGroup = useCallback((group: Field[], coordinate?: MapCoordinate) => {
        if (group.length === 0) return;
        setSelectedClusterFields(group.length > 1 ? group : null);
        setClusterFieldIndex(0);
        setSelectedMapField(group[0]);
        const target = coordinate ?? (group[0].lat != null && group[0].lng != null
            ? { latitude: group[0].lat, longitude: group[0].lng }
            : null);
        if (target) mapRef.current?.animateToCoordinate(target, 0.015);
    }, []);

    const handleFieldPress = useCallback((group: Field[]) => {
        openFieldGroup(group);
    }, [openFieldGroup]);

    const handleClusterPress = useCallback((clusterInfo: {
        clusterId: number;
        sport: string;
        count: number;
        items: MapMarkerItem<Field[]>[];
        coordinate: MapCoordinate;
    }) => {
        const clusterFields = clusterInfo.items.flatMap((it) => it.payload).filter(Boolean);
        openFieldGroup(clusterFields, clusterInfo.coordinate);
    }, [openFieldGroup]);

    // Render individual map marker with sport icon
    const renderMapMarker = useCallback((ctx: MapMarkerRenderContext<Field[]>) => {
        const group = ctx.item.payload;
        return (
            <FieldMapMarker
                key={ctx.item.id}
                group={group}
                selected={ctx.selected}
                showCallout={false}
                onPress={handleFieldPress}
            />
        );
    }, [handleFieldPress]);

    // Render field row for list view
    const renderField = ({ item: field }: { item: Field }) => (
        <TouchableOpacity
            onPress={() => router.push(`/field/${field.id}`)}
            className="flex-row items-center px-4 py-3 border-b border-gray-100 bg-white"
            accessibilityRole="button"
        >
            <View style={{ position: 'relative' }}>
                {field.image ? (
                    <Image source={{ uri: field.image }} className="w-14 h-14 rounded-xl mr-3 bg-gray-100" />
                ) : (
                    <View className="w-14 h-14 rounded-xl mr-3 bg-brand-mist items-center justify-center">
                        <FontAwesome name="map-marker" size={20} color="#059669" />
                    </View>
                )}
                <View style={{ position: 'absolute', top: -4, right: -4 }}>
                    <FavoriteButton fieldId={field.id} size={14} />
                </View>
            </View>
            <View className="flex-1">
                <Text className="text-base font-bold text-gray-900" numberOfLines={1}>{field.name}</Text>
                <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
                    {field.city || field.location || ''}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                    {field.type === 'closed' ? t('field.closedField', 'מגרש מקורה') : t('field.openField', 'מגרש פתוח')}
                    {typeof field.price === 'number' && field.price > 0
                        ? ` · ${t('field.pricePerHour', { price: field.price })}`
                        : ` · ${t('field.freePrice', 'חינם')}`}
                </Text>
            </View>
            <FontAwesome name="chevron-left" size={12} color="#d1d5db" />
        </TouchableOpacity>
    );

    return (
        <View className="flex-1 bg-white">
            {/* Mode Switch: Large Segmented Control ABOVE the Search Bar */}
            <View className="px-4 pt-3 pb-2 bg-white">
                <View className="flex-row bg-gray-100 p-1 rounded-2xl border border-gray-200">
                    <TouchableOpacity
                        onPress={() => setIsMapView(true)}
                        style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 10,
                            borderRadius: 12,
                            backgroundColor: isMapView ? '#059669' : 'transparent',
                        }}
                        accessibilityRole="button"
                    >
                        <FontAwesome
                            name="map"
                            size={16}
                            color={isMapView ? '#ffffff' : '#64748b'}
                            style={{ marginRight: 8 }}
                        />
                        <Text
                            style={{
                                fontSize: 16,
                                fontWeight: '800',
                                color: isMapView ? '#ffffff' : '#4b5563',
                            }}
                        >
                            {t('search.map', 'מפה')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setIsMapView(false)}
                        style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 10,
                            borderRadius: 12,
                            backgroundColor: !isMapView ? '#059669' : 'transparent',
                        }}
                        accessibilityRole="button"
                    >
                        <FontAwesome
                            name="list"
                            size={16}
                            color={!isMapView ? '#ffffff' : '#64748b'}
                            style={{ marginRight: 8 }}
                        />
                        <Text
                            style={{
                                fontSize: 16,
                                fontWeight: '800',
                                color: !isMapView ? '#ffffff' : '#4b5563',
                            }}
                        >
                            {t('search.list', 'רשימה')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search Input with Debounce */}
            <View className="px-4 py-2 border-b border-gray-100 bg-white">
                <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5">
                    <FontAwesome name="search" size={15} color="#9ca3af" />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t('field.searchPlaceholder', 'חפש מגרש או עיר')}
                        className="flex-1 ml-2.5 text-base text-gray-800"
                        returnKeyType="search"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => setQuery('')} className="p-1">
                            <FontAwesome name="times-circle" size={16} color="#9ca3af" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Sport Filter Pills */}
            <View className="px-4 py-2.5 border-b border-gray-100 bg-white">
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 2, alignItems: 'center' }}
                >
                    {filters.map((f) => {
                        const emoji = f.value !== 'ALL' ? SPORT_EMOJI[f.value] : undefined;
                        return (
                            <FilterPill
                                key={f.value}
                                label={emoji ? `${emoji} ${f.label}` : f.label}
                                selected={sportFilter === f.value}
                                onPress={() => setSportFilter(f.value)}
                                size="sm"
                            />
                        );
                    })}
                </ScrollView>
            </View>

            {/* Content: Map View or List View */}
            {isMapView ? (
                <View className="flex-1 relative">
                    <AppBaseMap
                        ref={mapRef}
                        markers={mapMarkers}
                        renderMarker={renderMapMarker}
                        selectedMarkerId={
                            selectedMapField && selectedMapField.lat != null && selectedMapField.lng != null
                                ? coordKey(selectedMapField.lat, selectedMapField.lng)
                                : null
                        }
                        onBoundsChange={handleMapBoundsChange}
                        onMapPress={() => {
                            setSelectedMapField(null);
                            setSelectedClusterFields(null);
                        }}
                        onClusterPress={handleClusterPress}
                        boundsDebounceMs={250}
                        loading={mapLoading}
                        clusterBySport={true}
                        variant="fill"
                        initialRegion={{
                            latitude: userLocation?.latitude || 32.0853,
                            longitude: userLocation?.longitude || 34.7818,
                            latitudeDelta: 0.1,
                            longitudeDelta: 0.1,
                        }}
                    />

                    {/* Selected Field Bottom Preview Card */}
                    {selectedMapField && (
                        <View
                            style={{
                                position: 'absolute',
                                bottom: 16,
                                left: 16,
                                right: 16,
                                zIndex: 99,
                                elevation: 20,
                            }}
                            pointerEvents="box-none"
                        >
                            <TouchableOpacity
                                activeOpacity={0.95}
                                onPress={() => router.push(`/field/${selectedMapField.id}`)}
                                style={{
                                    width: '100%',
                                    backgroundColor: '#ffffff',
                                    borderRadius: 20,
                                    padding: 14,
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 6 },
                                    shadowOpacity: 0.15,
                                    shadowRadius: 12,
                                    elevation: 12,
                                    borderWidth: 1,
                                    borderColor: '#e5e7eb',
                                }}
                            >
                                {/* Cluster Court Switcher if multiple courts at this pin */}
                                {selectedClusterFields && selectedClusterFields.length > 1 && (
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            marginBottom: 10,
                                            paddingBottom: 8,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#f3f4f6',
                                        }}
                                    >
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
                                            {t('field.clusterCourtsCount', { current: clusterFieldIndex + 1, total: selectedClusterFields.length })}
                                        </Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                            {selectedClusterFields.map((f, idx) => (
                                                <TouchableOpacity
                                                    key={f.id}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        setClusterFieldIndex(idx);
                                                        setSelectedMapField(f);
                                                    }}
                                                    style={{
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 3,
                                                        borderRadius: 8,
                                                        backgroundColor: clusterFieldIndex === idx ? '#059669' : '#f3f4f6',
                                                    }}
                                                >
                                                    <Text
                                                        style={{
                                                            fontSize: 11,
                                                            fontWeight: 'bold',
                                                            color: clusterFieldIndex === idx ? '#ffffff' : '#6b7280',
                                                        }}
                                                    >
                                                        {idx + 1}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    {/* Thumbnail or sport icon */}
                                    <View style={{ position: 'relative' }}>
                                        {selectedMapField.image ? (
                                            <Image
                                                source={{ uri: selectedMapField.image }}
                                                style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: '#f3f4f6' }}
                                            />
                                        ) : (
                                            <View
                                                style={{
                                                    width: 60,
                                                    height: 60,
                                                    borderRadius: 14,
                                                    backgroundColor: getSportColorHex(selectedMapField.supportedSports?.[0]) + '18',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                <MaterialCommunityIcons
                                                    name={getSportIconName(selectedMapField.supportedSports?.[0]) as any}
                                                    size={28}
                                                    color={getSportColorHex(selectedMapField.supportedSports?.[0])}
                                                />
                                            </View>
                                        )}
                                        <View style={{ position: 'absolute', top: -5, right: -5 }}>
                                            <FavoriteButton fieldId={selectedMapField.id} size={13} />
                                        </View>
                                    </View>

                                    {/* Info Column */}
                                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                                        <Text
                                            style={{ fontSize: 16, fontWeight: 'bold', color: '#111827', textAlign: 'left' }}
                                            numberOfLines={1}
                                        >
                                            {selectedMapField.name}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                            <FontAwesome name="map-marker" size={12} color="#9ca3af" style={{ marginRight: 4 }} />
                                            <Text
                                                style={{ fontSize: 13, color: '#6b7280', flex: 1, textAlign: 'left' }}
                                                numberOfLines={1}
                                            >
                                                {selectedMapField.location || selectedMapField.city || t('field.israel', 'ישראל')}
                                            </Text>
                                        </View>

                                        {/* Badges */}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 5, flexWrap: 'wrap' }}>
                                            {selectedMapField.supportedSports?.[0] && (
                                                <View style={{ backgroundColor: '#ecfdf5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0' }}>
                                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>
                                                        {t('sports.' + selectedMapField.supportedSports[0].toLowerCase(), SPORT_MAPPING[selectedMapField.supportedSports[0]] || selectedMapField.supportedSports[0])}
                                                    </Text>
                                                </View>
                                            )}
                                            <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#4b5563' }}>
                                                    {selectedMapField.type === 'closed' ? t('field.closedField', 'מגרש מקורה') : t('field.openField', 'מגרש פתוח')}
                                                </Text>
                                            </View>
                                            {typeof selectedMapField.price === 'number' && selectedMapField.price > 0 ? (
                                                <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                                                        {t('field.pricePerHour', { price: selectedMapField.price })}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                                                        {t('field.freePrice', 'חינם')}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    {/* Close Button */}
                                    <TouchableOpacity
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            setSelectedMapField(null);
                                            setSelectedClusterFields(null);
                                        }}
                                        style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: 15,
                                            backgroundColor: '#f3f4f6',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            alignSelf: 'flex-start',
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Close preview"
                                        hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                                    >
                                        <FontAwesome name="times" size={13} color="#6b7280" />
                                    </TouchableOpacity>
                                </View>

                                {/* Bottom Action Row */}
                                <View
                                    style={{
                                        marginTop: 10,
                                        paddingTop: 8,
                                        borderTopWidth: 1,
                                        borderTopColor: '#f3f4f6',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <Text style={{ fontSize: 12, color: '#9ca3af', fontWeight: '500' }}>
                                        {t('field.tapToViewDetails', 'לפרטים מלאים והזמנה')}
                                    </Text>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            backgroundColor: '#059669',
                                            paddingHorizontal: 12,
                                            paddingVertical: 6,
                                            borderRadius: 10,
                                        }}
                                    >
                                        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: 'bold', marginRight: 5 }}>
                                            {t('field.viewProfile', 'לפרופיל המגרש')}
                                        </Text>
                                        <FontAwesome name="arrow-left" size={10} color="#ffffff" />
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            ) : loading ? (
                <View className="flex-1 justify-center items-center">
                    <LoadingMotif id="pin-drop" label={t('field.loadingFields', 'טוען מגרשים…')} />
                </View>
            ) : fields.length === 0 ? (
                <View className="flex-1 justify-center items-center px-8">
                    <FontAwesome name="map-marker" size={32} color="#d1d5db" />
                    <Text className="text-gray-500 mt-3 text-center">
                        {t('field.emptyDirectory', 'לא נמצאו מגרשים')}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={fields}
                    keyExtractor={(field) => field.id}
                    renderItem={renderField}
                    keyboardShouldPersistTaps="handled"
                    onEndReachedThreshold={0.4}
                    onEndReached={loadMore}
                    contentContainerStyle={{ paddingBottom: 90 }}
                    ListFooterComponent={loadingMore ? (
                        <View className="py-4 items-center">
                            <ActivityIndicator />
                        </View>
                    ) : null}
                />
            )}
        </View>
    );
}

