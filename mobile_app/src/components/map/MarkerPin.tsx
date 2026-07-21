import React from 'react';
import { View, Text } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { MarkerVisual } from '@/utils/mapSport';

interface MarkerPinProps {
    visual: MarkerVisual;
    selected?: boolean;
    badgeCount?: number;
}

export default function MarkerPin({ visual, selected = false, badgeCount }: MarkerPinProps) {
    return (
        <View
            style={{
                backgroundColor: visual.colorHex,
                transform: selected ? [{ scale: 1.15 }] : undefined,
            }}
            className={`w-10 h-10 rounded-full items-center justify-center border-2 shadow-lg ${
                selected ? 'border-brand-light' : 'border-white'
            }`}
        >
            <MaterialCommunityIcons name={visual.iconName as any} size={20} color="white" />
            {badgeCount != null && badgeCount > 1 && (
                <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[16px] h-4 px-1 items-center justify-center">
                    <Text className="text-white text-[10px] font-bold">{badgeCount}</Text>
                </View>
            )}
        </View>
    );
}
