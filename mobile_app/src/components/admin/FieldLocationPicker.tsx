import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import AppBaseMap from '@/components/map/AppBaseMap';
import CustomPointMarker from '@/components/map/CustomPointMarker';
import { DEFAULT_MAP_REGION, MapCoordinate, MapMarkerItem, MapRegion } from '@/components/map/types';

interface FieldLocationPickerProps {
    lat: number | null;
    lng: number | null;
    onChange: (lat: number, lng: number) => void;
    /** Free-text hint (built from the field's address) shown above the map to help the admin place the pin. */
    addressHint?: string;
}

const NO_MARKERS: MapMarkerItem<null>[] = [];

/**
 * Admin-only tap-to-place location picker, mirroring next_app's FieldLocationPicker
 * (next_app/src/components/admin/FieldLocationPicker.tsx) but built on the existing
 * react-native-maps stack (AppBaseMap + CustomPointMarker) instead of
 * @vis.gl/react-google-maps -- reuses the exact tap-to-place pattern already proven
 * in app/game/new.tsx's custom-location flow.
 */
export default function FieldLocationPicker({ lat, lng, onChange, addressHint }: FieldLocationPickerProps) {
    const [modalVisible, setModalVisible] = useState(false);
    const [draftPoint, setDraftPoint] = useState<MapCoordinate | null>(
        lat != null && lng != null ? { latitude: lat, longitude: lng } : null
    );

    const initialRegion = useMemo<MapRegion>(() => {
        if (lat != null && lng != null) {
            return { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
        }
        return DEFAULT_MAP_REGION;
    }, [lat, lng]);

    const openPicker = useCallback(() => {
        setDraftPoint(lat != null && lng != null ? { latitude: lat, longitude: lng } : null);
        setModalVisible(true);
    }, [lat, lng]);

    const handleMapPress = useCallback((coordinate: MapCoordinate) => {
        setDraftPoint(coordinate);
    }, []);

    const confirm = useCallback(() => {
        if (!draftPoint) return;
        onChange(draftPoint.latitude, draftPoint.longitude);
        setModalVisible(false);
    }, [draftPoint, onChange]);

    const hasLocation = lat != null && lng != null;

    return (
        <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-1 text-right">מיקום במפה</Text>
            <TouchableOpacity
                onPress={openPicker}
                className={`flex-row items-center justify-between px-4 py-3 rounded-xl border ${hasLocation ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-200'}`}
            >
                <FontAwesome name="chevron-left" size={12} color="#9ca3af" />
                <View className="flex-row items-center">
                    {!hasLocation && <FontAwesome name="exclamation-triangle" size={14} color="#d97706" style={{ marginLeft: 8 }} />}
                    <Text className={`font-bold text-sm ${hasLocation ? 'text-gray-800' : 'text-amber-700'}`}>
                        {hasLocation ? `${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : 'ללא מיקום — הקש לבחירה במפה'}
                    </Text>
                </View>
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View className="flex-1 bg-white">
                    <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
                        <TouchableOpacity onPress={() => setModalVisible(false)} className="p-2">
                            <Text className="text-gray-500 font-bold">ביטול</Text>
                        </TouchableOpacity>
                        <Text className="font-bold text-gray-900">בחירת מיקום במפה</Text>
                        <TouchableOpacity onPress={confirm} disabled={!draftPoint} className="p-2">
                            <Text className={`font-bold ${draftPoint ? 'text-brand' : 'text-gray-300'}`}>אישור</Text>
                        </TouchableOpacity>
                    </View>

                    {addressHint ? (
                        <View className="px-4 py-2 bg-brand-mist border-b border-brand-pale">
                            <Text className="text-brand-dark text-xs text-center">הקישו על המיקום המדויק של: {addressHint}</Text>
                        </View>
                    ) : (
                        <View className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <Text className="text-gray-500 text-xs text-center">הקישו על המפה כדי להציב את הסמן</Text>
                        </View>
                    )}

                    <AppBaseMap
                        variant="fill"
                        className="flex-1"
                        markers={NO_MARKERS}
                        renderMarker={() => null}
                        onMapPress={handleMapPress}
                        initialRegion={initialRegion}
                        overlayChildren={draftPoint ? <CustomPointMarker coordinate={draftPoint} /> : null}
                    />
                </View>
            </Modal>
        </View>
    );
}
