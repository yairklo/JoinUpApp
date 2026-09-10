import React from 'react';
import { View, Text } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { getFieldMarkerVisual, getFieldSportTags, NEUTRAL_MARKER_VISUAL } from '@/utils/mapSport';
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
    /** Courts at the exact same coordinates (a multi-court venue) — usually a single field. */
    group: MapField[];
    selected?: boolean;
    onPress: (group: MapField[]) => void;
    showCallout?: boolean;
    onCalloutPress?: () => void;
}

const FieldMapMarker = React.memo(function FieldMapMarker({
    group,
    selected = false,
    onPress,
    showCallout = false,
    onCalloutPress,
}: FieldMapMarkerProps) {
    const field = group[0];
    const lat = field.lat;
    const lng = field.lng;
    // A venue with courts of more than one sport at the exact same spot gets the same
    // neutral badge getFieldMarkerVisual already uses for a single multi-sport field,
    // instead of arbitrarily picking one court's color and hiding the rest.
    const isMixed = new Set(group.flatMap((f) => getFieldSportTags(f))).size > 1;
    const visual = isMixed ? NEUTRAL_MARKER_VISUAL : getFieldMarkerVisual(field);
    const tracksViewChanges = useTracksViewChangesFreeze([
        group.map((f) => f.id).join(','),
        selected,
        visual.iconName,
        visual.colorHex,
    ]);

    if (lat == null || lng == null) return null;

    return (
        <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
            tracksViewChanges={tracksViewChanges}
            onPress={(e) => {
                e.stopPropagation();
                onPress(group);
            }}
        >
            <MarkerPin visual={visual} selected={selected} isCluster={group.length > 1} />
            {showCallout && group.length === 1 && (
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
