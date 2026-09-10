import React from 'react';
import { View, Text } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { getFieldMarkerVisual } from '@/utils/mapSport';
import MarkerPin from './MarkerPin';
import { useTracksViewChangesFreeze } from './useTracksViewChangesFreeze';

export interface MapField {
    id: string;
    name: string;
    lat?: number | null;
    lng?: number | null;
    location?: string | null;
    city?: string | null;
    supportedSports?: string[];
}

interface FieldMapMarkerProps {
    field: MapField;
    selected?: boolean;
    onPress: (field: MapField) => void;
    showCallout?: boolean;
    onCalloutPress?: () => void;
}

const FieldMapMarker = React.memo(function FieldMapMarker({
    field,
    selected = false,
    onPress,
    showCallout = false,
    onCalloutPress,
}: FieldMapMarkerProps) {
    const lat = field.lat;
    const lng = field.lng;
    const visual = getFieldMarkerVisual(field);
    const tracksViewChanges = useTracksViewChangesFreeze([field.id, selected, visual.iconName, visual.colorHex]);

    if (lat == null || lng == null) return null;

    return (
        <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
            tracksViewChanges={tracksViewChanges}
            onPress={(e) => {
                e.stopPropagation();
                onPress(field);
            }}
        >
            <MarkerPin visual={visual} selected={selected} />
            {showCallout && (
                <Callout tooltip onPress={onCalloutPress}>
                    <View className="bg-white p-3 rounded-xl min-w-[140px] shadow-md border border-gray-100">
                        <Text className="font-bold text-gray-900 text-center">{field.name}</Text>
                        {(field.city || field.location) && (
                            <Text className="text-gray-500 text-xs text-center mt-1">
                                {field.city || field.location}
                            </Text>
                        )}
                    </View>
                </Callout>
            )}
        </Marker>
    );
});

export default FieldMapMarker;
