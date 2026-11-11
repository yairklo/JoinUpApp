import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, TouchableOpacity, ActivityIndicator, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { fieldPhotosApi, fieldPhotoSrc, type FieldPhotosResponse } from '@/services/api/fieldPhotos';
import FieldPhotoViewer from './FieldPhotoViewer';
import FieldPhotoUploadSheet from './FieldPhotoUploadSheet';

const HEIGHT = 220;
const MAX_DOTS = 10;
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

type Slide = { id: string; url: string; pending: boolean };

function SlideImage({ uri, label }: { uri: string; label: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <View
                className="flex-1 items-center justify-center bg-gray-200 dark:bg-cyber-border"
                accessible
                accessibilityRole="image"
                accessibilityLabel={label}
            >
                <FontAwesome name="camera" size={28} color="#9ca3af" />
            </View>
        );
    }
    return (
        <Image
            source={{ uri }}
            style={{ flex: 1 }}
            contentFit="cover"
            // A flat tint while the photo loads, then a short cross-fade.
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            placeholderContentFit="cover"
            transition={200}
            recyclingKey={uri}
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
        />
    );
}

interface FieldGalleryProps {
    fieldId: string;
    fieldName: string;
    /** The field's cover (`field.image`), shown until the photo list arrives or if it fails to load. */
    fallbackImage?: string | null;
}

/**
 * The field screen's photo header: a swipeable carousel of the approved photos, followed (for the
 * signed-in uploader only) by their own photos still awaiting review. Tapping a photo opens the
 * fullscreen viewer; with no photos at all it invites the first upload.
 * Mobile counterpart of next_app/src/components/fields/FieldGallery.tsx.
 */
export default function FieldGallery({ fieldId, fieldName, fallbackImage }: FieldGalleryProps) {
    const { t } = useTranslation();
    const router = useRouter();
    const { isSignedIn, getToken } = useAuth();
    const [data, setData] = useState<FieldPhotosResponse | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [width, setWidth] = useState(0);
    const [index, setIndex] = useState(0);
    const [viewerAt, setViewerAt] = useState<number | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = isSignedIn ? await getToken() : null;
            setData(await fieldPhotosApi.list(fieldId, token));
        } catch {
            // Keep the cover photo; the gallery is not worth an error state of its own.
        } finally {
            setLoaded(true);
        }
    }, [fieldId, getToken, isSignedIn]);

    useEffect(() => {
        void load();
    }, [load]);

    const slides: Slide[] = useMemo(() => {
        if (!data) return fallbackImage ? [{ id: 'cover', url: fallbackImage, pending: false }] : [];
        return [
            ...data.photos.map((p) => ({ id: p.id, url: p.url, pending: false })),
            ...data.mine.map((p) => ({ id: p.id, url: p.url, pending: true })),
        ];
    }, [data, fallbackImage]);

    const total = slides.length;
    const approvedCount = slides.filter((s) => !s.pending).length;
    const current = Math.min(index, Math.max(0, total - 1));

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

    const removeMine = async (photoId: string) => {
        setRemovingId(photoId);
        try {
            const token = await getToken();
            if (token) await fieldPhotosApi.remove(fieldId, photoId, token);
            await load();
        } catch {
            // Left in place; the user can try again.
        } finally {
            setRemovingId(null);
        }
    };

    const remaining = data?.remaining ?? 0;
    const fieldFull = data?.fieldFull ?? false;
    const canAdd = !!isSignedIn && !!data && !fieldFull && remaining > 0;

    const sheet =
        isSignedIn && data ? (
            <FieldPhotoUploadSheet
                visible={sheetOpen}
                onClose={() => setSheetOpen(false)}
                fieldId={fieldId}
                fieldName={fieldName}
                remaining={remaining}
                fieldFull={fieldFull}
                onUploaded={load}
            />
        ) : null;

    if (total === 0) {
        // Until the first response there is nothing to say yet: hold the space, don't flash the invitation.
        if (!loaded) {
            return <View style={{ height: HEIGHT }} className="bg-gray-200 dark:bg-cyber-border" />;
        }
        return (
            <View style={{ height: HEIGHT }} className="items-center justify-center px-6 bg-brand-mist dark:bg-brand-ink">
                <View className="w-14 h-14 rounded-full bg-white dark:bg-cyber-card items-center justify-center mb-3">
                    <FontAwesome name="camera" size={22} color="#047857" />
                </View>
                <Text className="text-brand-dark dark:text-brand-light font-bold text-base text-center mb-3">
                    {t('fieldPhotos.emptyTitle', 'עדיין אין תמונות של המגרש')}
                </Text>
                <TouchableOpacity
                    onPress={() => (isSignedIn ? setSheetOpen(true) : router.push('/sign-in'))}
                    disabled={!!isSignedIn && !data}
                    accessibilityRole="button"
                    className="flex-row items-center px-5 py-3 rounded-xl bg-brand"
                >
                    <FontAwesome name="plus" size={13} color="#fff" />
                    <Text className="text-white font-bold mx-2">
                        {isSignedIn
                            ? t('fieldPhotos.addFirst', 'הוסיפו תמונה ראשונה')
                            : t('fieldPhotos.signInToAdd', 'התחברו כדי להוסיף תמונה')}
                    </Text>
                </TouchableOpacity>
                {sheet}
            </View>
        );
    }

    return (
        <View
            style={{ height: HEIGHT }}
            className="bg-gray-200 dark:bg-cyber-border"
            onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        >
            {width > 0 ? (
                <FlatList
                    // Item widths are baked into getItemLayout, so re-create the list if the width changes.
                    key={width}
                    data={slides}
                    keyExtractor={(s) => s.id}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    getItemLayout={getItemLayout}
                    initialNumToRender={1}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    onViewableItemsChanged={onViewable}
                    viewabilityConfig={VIEWABILITY}
                    accessibilityRole="adjustable"
                    accessibilityLabel={t('fieldPhotos.galleryLabel', { defaultValue: 'תמונות של {{name}}', name: fieldName })}
                    accessibilityValue={{
                        text: t('fieldPhotos.counter', { defaultValue: 'תמונה {{index}} מתוך {{total}}', index: current + 1, total }),
                    }}
                    renderItem={({ item, index: i }) => {
                        const label = item.pending
                            ? t('fieldPhotos.pendingAlt', { defaultValue: '{{name}} - תמונה שהוספת, ממתינה לאישור', name: fieldName })
                            : t('fieldPhotos.photoAlt', {
                                defaultValue: '{{name}} - תמונה {{index}} מתוך {{total}}',
                                name: fieldName,
                                index: i + 1,
                                total: approvedCount,
                            });
                        return (
                            <View style={{ width, height: HEIGHT }}>
                                <Pressable
                                    onPress={() => setViewerAt(i)}
                                    style={{ flex: 1, opacity: item.pending ? 0.6 : 1 }}
                                    accessibilityRole="imagebutton"
                                    accessibilityLabel={label}
                                    accessibilityHint={t('fieldPhotos.openHint', 'הקשה פותחת את התמונה במסך מלא')}
                                >
                                    <SlideImage uri={fieldPhotoSrc(item.url, 1080)} label={label} />
                                </Pressable>
                                {item.pending ? (
                                    <>
                                        <View
                                            style={{ position: 'absolute', top: 12, start: 12 }}
                                            className="flex-row items-center px-3 py-1 rounded-full bg-amber-500"
                                        >
                                            <FontAwesome name="hourglass-half" size={10} color="#fff" />
                                            <Text className="text-white text-xs font-bold mx-1">
                                                {t('fieldPhotos.pendingBadge', 'ממתינה לאישור')}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => removeMine(item.id)}
                                            disabled={removingId === item.id}
                                            hitSlop={10}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('fieldPhotos.removeMine', 'הסרת התמונה שהוספת')}
                                            style={{ position: 'absolute', bottom: 12, start: 12 }}
                                            className="w-9 h-9 rounded-full bg-black/60 items-center justify-center"
                                        >
                                            {removingId === item.id ? (
                                                <ActivityIndicator size="small" color="#fff" />
                                            ) : (
                                                <FontAwesome name="trash-o" size={15} color="#fff" />
                                            )}
                                        </TouchableOpacity>
                                    </>
                                ) : null}
                            </View>
                        );
                    }}
                />
            ) : null}

            {isSignedIn ? (
                <TouchableOpacity
                    onPress={() => setSheetOpen(true)}
                    disabled={!canAdd}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canAdd }}
                    accessibilityLabel={t('fieldPhotos.add', 'הוספת תמונות')}
                    style={{ position: 'absolute', bottom: 12, end: 12, opacity: canAdd ? 1 : 0.5 }}
                    className="flex-row items-center px-3 py-2 rounded-full bg-black/60"
                >
                    <FontAwesome name="camera" size={12} color="#fff" />
                    <Text className="text-white text-xs font-bold mx-1.5">{t('fieldPhotos.add', 'הוספת תמונות')}</Text>
                </TouchableOpacity>
            ) : null}

            {total > 1 ? (
                <>
                    {total <= MAX_DOTS ? (
                        <View
                            pointerEvents="none"
                            importantForAccessibility="no-hide-descendants"
                            accessibilityElementsHidden
                            style={{ position: 'absolute', bottom: 14, left: 0, right: 0 }}
                            className="items-center"
                        >
                            <View className="flex-row items-center px-2 py-1 rounded-full bg-black/40">
                                {slides.map((s, i) => (
                                    <View
                                        key={s.id}
                                        style={{
                                            width: i === current ? 16 : 6,
                                            height: 6,
                                            borderRadius: 3,
                                            marginHorizontal: 3,
                                            backgroundColor: i === current ? '#fff' : 'rgba(255,255,255,0.55)',
                                        }}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : null}
                    <View
                        pointerEvents="none"
                        importantForAccessibility="no-hide-descendants"
                        accessibilityElementsHidden
                        style={{ position: 'absolute', bottom: 12, start: 12 }}
                        className="px-2 py-1 rounded-full bg-black/60"
                    >
                        <Text className="text-white text-xs" style={{ fontVariant: ['tabular-nums'] }}>
                            {`${current + 1} / ${total}`}
                        </Text>
                    </View>
                </>
            ) : null}

            <FieldPhotoViewer
                visible={viewerAt !== null}
                onClose={() => setViewerAt(null)}
                fieldName={fieldName}
                photos={slides}
                startIndex={viewerAt ?? 0}
            />
            {sheet}
        </View>
    );
}
