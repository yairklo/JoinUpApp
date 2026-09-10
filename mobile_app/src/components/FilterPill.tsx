import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

/** Shared rounded filter/selector pill, used by the date nav and the fields sport filter. */
export default function FilterPill({
    label,
    selected,
    onPress,
    size = 'md',
}: {
    label: string;
    selected: boolean;
    onPress: () => void;
    size?: 'sm' | 'md';
}) {
    const padding = size === 'sm' ? 'px-4 py-1.5' : 'px-5 py-2.5';
    const margin = size === 'sm' ? 'mr-2' : 'mr-3';
    return (
        <TouchableOpacity
            onPress={onPress}
            className={`${margin} ${padding} rounded-full border ${selected ? 'bg-brand border-brand' : 'bg-white border-gray-100'}`}
        >
            <Text className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-500'}`}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}
