import React, { useState, useEffect, memo } from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { getSportMarkerVisual } from '@/utils/mapSport';
import MarkerPin from './MarkerPin';
import { useTracksViewChangesFreeze } from './useTracksViewChangesFreeze';

interface SportClusterMarkerProps {
    id: string;
    clusterId?: number;
    sport: string;
    count: number;
    latitude: number;
    longitude: number;
    onPress: (clusterId?: number, sport?: string, latitude?: number, longitude?: number) => void;
}

const SportClusterMarker = memo(function SportClusterMarker({
    clusterId,
    sport,
    count,
    latitude,
    longitude,
    onPress,
}: SportClusterMarkerProps) {
    const visual = getSportMarkerVisual(sport);
    const tracksViewChanges = useTracksViewChangesFreeze([count, visual.iconName, visual.colorHex]);

    return (
        <Marker
            coordinate={{ latitude, longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={tracksViewChanges}
            onPress={(e) => {
                e.stopPropagation();
                onPress(clusterId, sport, latitude, longitude);
            }}
        >
            <MarkerPin visual={visual} isCluster={true} badgeCount={count} />
        </Marker>
    );
});

export default SportClusterMarker;
