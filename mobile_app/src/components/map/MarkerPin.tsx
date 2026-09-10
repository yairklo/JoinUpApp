import React from 'react';
import { View, Text } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { MarkerVisual } from '@/utils/mapSport';

interface MarkerPinProps {
    visual: MarkerVisual;
    selected?: boolean;
    badgeCount?: number;
    isCluster?: boolean;
}

export default function MarkerPin({
    visual,
    selected = false,
    badgeCount,
    isCluster = false,
}: MarkerPinProps) {
    if (isCluster) {
        return (
            <View
                style={{
                    backgroundColor: visual.colorHex,
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    borderWidth: 2.5,
                    borderColor: '#ffffff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 5,
                    position: 'relative',
                }}
            >
                <MaterialCommunityIcons name={visual.iconName as any} size={18} color="white" />
                <View
                    style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        backgroundColor: '#0f172a',
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: badgeCount != null && badgeCount > 9 ? 3 : 0,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#ffffff',
                    }}
                >
                    {badgeCount != null ? (
                        <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>{badgeCount}</Text>
                    ) : (
                        <FontAwesome name="plus" size={7} color="white" />
                    )}
                </View>
            </View>
        );
    }

    return (
        <View style={{ position: 'relative' }}>
            <View
                style={{
                    backgroundColor: visual.colorHex,
                    // Always a well-formed array (never undefined/null) — RN's Fabric style
                    // diffing crashed with "Cannot read property 'forEach' of null" in
                    // processTransform when this toggled between an array and undefined
                    // across a re-render (surfaced once `selected` actually started flipping).
                    transform: [{ scale: selected ? 1.15 : 1 }],
                    width: 27,
                    height: 27,
                    borderRadius: 13.5,
                    borderWidth: 2,
                    borderColor: selected ? '#34d399' : '#ffffff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 3,
                }}
            >
                <MaterialCommunityIcons name={visual.iconName as any} size={13} color="white" />
            </View>
            {badgeCount != null && badgeCount > 1 && (
                <View
                    style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        backgroundColor: '#ef4444',
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: badgeCount > 9 ? 3 : 0,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: '#ffffff',
                    }}
                >
                    <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>{badgeCount}</Text>
                </View>
            )}
        </View>
    );
}
