import React from 'react';
import { Marker } from 'react-native-maps';
import { EMPTY_FIELD_MARKER_VISUAL } from '@/utils/mapSport';
import MarkerPin from './MarkerPin';
import type { MapField } from './FieldMapMarker';

interface EmptyFieldMapMarkerProps {
    field: MapField;
    onPress: (field: MapField) => void;
    onAnimateTo: (latitude: number, longitude: number) => void;
}

const EmptyFieldMapMarker = React.memo(function EmptyFieldMapMarker({
    field,
    onPress,
    onAnimateTo,
}: EmptyFieldMapMarkerProps) {
    const lat = field.lat;
    const lng = field.lng;
    if (lat == null || lng == null) return null;

    return (
        <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            anchor={{ x: 0.5, y: 1.0 }}
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
            tracksViewChanges={false}
            onPress={(e) => {
                e.stopPropagation();
                onAnimateTo(lat, lng);
                onPress(field);
            }}
        >
            <MarkerPin visual={EMPTY_FIELD_MARKER_VISUAL} />
        </Marker>
    );
});

export default EmptyFieldMapMarker;
