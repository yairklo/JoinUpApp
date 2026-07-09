import React from 'react';
import { Marker } from 'react-native-maps';
import { Game } from '@/types/game';
import { getSportMarkerVisual } from '@/utils/mapSport';
import MarkerPin from './MarkerPin';

interface GameMapMarkerProps {
    group: Game[];
    onPress: (games: Game[]) => void;
    onAnimateTo: (latitude: number, longitude: number) => void;
}

const GameMapMarker = React.memo(function GameMapMarker({
    group,
    onPress,
    onAnimateTo,
}: GameMapMarkerProps) {
    const firstGame = group[0];
    const lat = firstGame.customLat || firstGame.fieldLat || firstGame.field?.lat;
    const lng = firstGame.customLng || firstGame.fieldLng || firstGame.field?.lng;
    if (lat == null || lng == null) return null;

    const uniqueSports = [...new Set(group.map((g) => g.sport))];
    const isMixed = uniqueSports.length > 1;
    const visual = isMixed
        ? { iconName: 'map-marker-multiple', colorHex: '#64748b', variant: 'neutral' as const }
        : getSportMarkerVisual(firstGame.sport);

    return (
        <Marker
            coordinate={{ latitude: lat, longitude: lng }}
            anchor={{ x: 0.5, y: 1.0 }}
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
            tracksViewChanges={false}
            onPress={(e) => {
                e.stopPropagation();
                onAnimateTo(lat, lng);
                onPress(group);
            }}
        >
            <MarkerPin visual={visual} badgeCount={group.length} />
        </Marker>
    );
}, (prev, next) => {
    if (prev.group.length !== next.group.length) return false;
    return prev.group.map((g) => g.id).join(',') === next.group.map((g) => g.id).join(',');
});

export default GameMapMarker;
