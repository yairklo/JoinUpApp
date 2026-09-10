import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';

interface MapListToggleProps {
    isMapView: boolean;
    onChange: (isMapView: boolean) => void;
}

/**
 * Large segmented map/list control shown above the search bar. Shared by the fields
 * directory and the games search screen so both switch views the same way instead of
 * one using a prominent top toggle and the other burying it in the filter chip row.
 */
export default function MapListToggle({ isMapView, onChange }: MapListToggleProps) {
    const { t } = useTranslation();

    return (
        <View className="px-4 pt-3 pb-2 bg-white">
            <View className="flex-row bg-gray-100 p-1 rounded-2xl border border-gray-200">
                <TouchableOpacity
                    onPress={() => onChange(true)}
                    style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: isMapView ? '#059669' : 'transparent',
                    }}
                    accessibilityRole="button"
                >
                    <FontAwesome
                        name="map"
                        size={16}
                        color={isMapView ? '#ffffff' : '#64748b'}
                        style={{ marginRight: 8 }}
                    />
                    <Text
                        style={{
                            fontSize: 16,
                            fontWeight: '800',
                            color: isMapView ? '#ffffff' : '#4b5563',
                        }}
                    >
                        {t('search.map', 'מפה')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => onChange(false)}
                    style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: !isMapView ? '#059669' : 'transparent',
                    }}
                    accessibilityRole="button"
                >
                    <FontAwesome
                        name="list"
                        size={16}
                        color={!isMapView ? '#ffffff' : '#64748b'}
                        style={{ marginRight: 8 }}
                    />
                    <Text
                        style={{
                            fontSize: 16,
                            fontWeight: '800',
                            color: !isMapView ? '#ffffff' : '#4b5563',
                        }}
                    >
                        {t('search.list', 'רשימה')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
