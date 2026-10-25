import React from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { buildMapLinks, type MapLinks, type MapLocationInput } from '@joinup/shared/mapLinks';

type Choice = { label: string; url: string };

function choices(links: MapLinks, t: (key: string) => string): Choice[] {
    const items: Choice[] = [
        { label: t('map.waze'), url: links.wazeUrl },
        { label: t('map.googleMaps'), url: links.googleMapsUrl },
    ];
    if (Platform.OS === 'ios') {
        items.push({ label: t('map.appleMaps'), url: links.appleMapsUrl });
    }
    return items;
}

function openChooser(links: MapLinks, title: string, cancel: string, t: (key: string) => string) {
    const items = choices(links, t);
    if (Platform.OS === 'ios') {
        const labels = [...items.map((item) => item.label), cancel];
        ActionSheetIOS.showActionSheetWithOptions(
            { options: labels, cancelButtonIndex: labels.length - 1, title },
            (index) => {
                const picked = items[index];
                if (picked) void Linking.openURL(picked.url);
            },
        );
        return;
    }
    Alert.alert(title, undefined, [
        ...items.map((item) => ({ text: item.label, onPress: () => void Linking.openURL(item.url) })),
        { text: cancel, style: 'cancel' as const },
    ]);
}

/**
 * "פתיחה במפה". Offers Waze and Google Maps, plus Apple Maps on iOS.
 * Renders nothing when the venue has no coordinates and no address or name.
 */
export default function OpenInMapButton({
    location,
    variant = 'inline',
}: {
    location: MapLocationInput;
    /** Circle action on the game page; a text row everywhere else. */
    variant?: 'utility' | 'inline';
}) {
    const { t } = useTranslation();
    const links = buildMapLinks(location);
    if (!links) return null;
    const label = t('map.openInMap');
    const open = () => openChooser(links, label, t('common.cancel'), t);

    if (variant === 'utility') {
        return (
            <TouchableOpacity
                className="items-center"
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                <View className="w-12 h-12 bg-brand-mist dark:bg-cyber-border rounded-full items-center justify-center mb-1">
                    <FontAwesome name="location-arrow" size={20} color="#059669" />
                </View>
                <Text className="text-xs text-gray-600 dark:text-cyber-muted font-bold">{label}</Text>
            </TouchableOpacity>
        );
    }

    return (
        <Pressable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="flex-row items-center"
            style={{ minHeight: 44 }}
        >
            <FontAwesome name="location-arrow" size={16} color="#059669" style={{ width: 24 }} />
            <Text className="text-brand font-bold text-[14px]">{label}</Text>
        </Pressable>
    );
}
