import React from 'react';
import { Marker } from 'react-native-maps';
import MarkerPin from './MarkerPin';
import type { MapCoordinate } from './types';

const CUSTOM_POINT_VISUAL = {
    iconName: 'map-marker',
    colorHex: '#059669',
    variant: 'neutral' as const,
};

interface CustomPointMarkerProps {
    coordinate: MapCoordinate;
}

export default function CustomPointMarker({ coordinate }: CustomPointMarkerProps) {
    const [tracksViewChanges, setTracksViewChanges] = React.useState(true);
    return (
        <Marker
            coordinate={coordinate}
            anchor={{ x: 0.5, y: 1.0 }}
            tracksViewChanges={tracksViewChanges}
            onLayout={() => setTracksViewChanges(false)}
            cluster={false}
        >
            <MarkerPin visual={CUSTOM_POINT_VISUAL} selected />
        </Marker>
    );
}
