import React from 'react';
import { View, Text } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { getFieldMarkerVisual } from '@/utils/mapSport';
import MarkerPin from './MarkerPin';

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
    preferredSport?: string;
    selected?: boolean;
    onPress: () => void;
    showCallout?: boolean;
}

const FieldMapMarker = React.memo(function FieldMapMarker({
    field,
    preferredSport,
    selected = false,
    onPress,
    showCallout = false,
}: FieldMapMarkerProps) {
    const lat = field.lat;
    const lng = field.lng;
    if (lat == null || lng == null) return null;

    const visual = getFieldMarkerVisual(field, preferredSport);

    return (
        <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            anchor={{ x: 0.5, y: 1.0 }}
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
            tracksViewChanges={false}
            onPress={(e) => {
                e.stopPropagation();
                onPress();
            }}
        >
            <MarkerPin visual={visual} selected={selected} />
            {showCallout && (
                <Callout tooltip>
                    <View className="bg-white p-3 rounded-xl min-w-[140px]">
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
