import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Modal, FlatList, TouchableOpacity, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldPhotoSrc } from '@/services/api/fieldPhotos';

interface FieldPhotoViewerProps {
    visible: boolean;
    onClose: () => void;
    fieldName: string;
    photos: { id: string; url: string }[];
    startIndex: number;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** Fullscreen photo viewer: the same swipeable strip as the gallery, on black, uncropped. */
export default function FieldPhotoViewer({ visible, onClose, fieldName, photos, startIndex }: FieldPhotoViewerProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [index, setIndex] = useState(startIndex);
    const total = photos.length;

    // FlatList requires a stable onViewableItemsChanged; the index comes from what is on screen
    // rather than the scroll offset, whose direction flips under RTL.
    const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        const first = viewableItems[0];
        if (first && typeof first.index === 'number') setIndex(first.index);
    }).current;

    const getItemLayout = useCallback(
        (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
        [width]
    );

    if (total === 0) return null;
    const safeStart = Math.min(Math.max(0, startIndex), total - 1);

    return (
        <Modal
            visible={visible}
            animationType="fade"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={onClose}
            onShow={() => setIndex(safeStart)}
        >
            <View className="flex-1 bg-black" accessibilityViewIsModal>
                <FlatList
                    // Remount per opening and per rotation so initialScrollIndex and item widths are always right.
                    key={`${safeStart}-${width}`}
                    data={photos}
                    keyExtractor={(p) => p.id}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={safeStart}
                    getItemLayout={getItemLayout}
                    initialNumToRender={1}
                    windowSize={3}
                    onViewableItemsChanged={onViewable}
                    viewabilityConfig={VIEWABILITY}
                    accessibilityLabel={t('fieldPhotos.galleryLabel', { defaultValue: 'תמונות של {{name}}', name: fieldName })}
                    renderItem={({ item, index: i }) => (
                        <View style={{ width, height }} className="items-center justify-center">
                            <Image
                                source={{ uri: fieldPhotoSrc(item.url, 1600) }}
                                style={{ width, height }}
                                contentFit="contain"
                                transition={150}
                                recyclingKey={item.id}
                                accessible
                                accessibilityRole="image"
                                accessibilityIgnoresInvertColors
                                accessibilityLabel={t('fieldPhotos.photoAlt', {
                                    defaultValue: '{{name}} - תמונה {{index}} מתוך {{total}}',
                                    name: fieldName,
                                    index: i + 1,
                                    total,
                                })}
                            />
                        </View>
                    )}
                />

                <TouchableOpacity
                    onPress={onClose}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t('fieldPhotos.closeViewer', 'סגירת הגלריה')}
                    style={{ position: 'absolute', top: insets.top + 12, start: 16 }}
                    className="w-10 h-10 rounded-full bg-black/60 items-center justify-center"
                >
                    <FontAwesome name="times" size={18} color="#fff" />
                </TouchableOpacity>

                {total > 1 ? (
                    <View
                        pointerEvents="none"
                        style={{ position: 'absolute', top: insets.top + 20, left: 0, right: 0 }}
                        className="items-center"
                    >
                        <View className="px-3 py-1 rounded-full bg-black/60" accessibilityLiveRegion="polite">
                            <Text className="text-white text-sm" style={{ fontVariant: ['tabular-nums'] }}>
                                {`${index + 1} / ${total}`}
                            </Text>
                        </View>
                    </View>
                ) : null}
            </View>
        </Modal>
    );
}
