import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
import { MAX_FIELD_PHOTOS } from '@joinup/shared/upload';
import { fieldPhotosApi, fieldPhotoSrc, type FieldPhoto } from '@/services/api/fieldPhotos';
import { useFieldPhotoUpload } from '@/hooks/useFieldPhotoUpload';
import { pickFieldPhotos } from '@/utils/pickFieldPhotos';
import { resizeImage } from '@/utils/resizeImage';

interface FieldPhotoGalleryProps {
    fieldId: string;
    /** Called after the published photos change (the first one is the field's cover). */
    onChanged?: () => void;
}

/**
 * Admin editor for a field's published photos: add several at once (published immediately),
 * remove, and reorder. The first photo is the field's cover everywhere else in the app. Photos
 * users suggested wait in app/admin/photos.tsx, not here.
 * Mobile counterpart of next_app/src/components/admin/FieldPhotoGallery.tsx; like the rest of
 * the admin area, the copy is Hebrew only.
 */
export default function FieldPhotoGallery({ fieldId, onChanged }: FieldPhotoGalleryProps) {
    const { getToken } = useAuth();
    const [photos, setPhotos] = useState<FieldPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [picking, setPicking] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            const data = await fieldPhotosApi.list(fieldId, token);
            setPhotos(data.photos);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'טעינת התמונות נכשלה');
        } finally {
            setLoading(false);
        }
    }, [fieldId, getToken]);

    useEffect(() => {
        void load();
    }, [load]);

    const afterChange = useCallback(async () => {
        await load();
        onChanged?.();
    }, [load, onChanged]);

    const { items, busy, addAssets, clearSettled } = useFieldPhotoUpload(fieldId, afterChange, resizeImage);
    const uploading = items.filter((it) => it.status !== 'done' && it.status !== 'error');
    const failed = items.filter((it) => it.status === 'error');
    const slots = Math.max(0, MAX_FIELD_PHOTOS - photos.length - uploading.length);

    const handlePick = async () => {
        setError(null);
        setPicking(true);
        try {
            const picked = await pickFieldPhotos(slots);
            if (!picked) return;
            clearSettled();
            const result = addAssets(picked, slots);
            setNotice(
                result.skippedCount > 0
                    ? `נבחרו ${picked.length} תמונות, אבל נשארו רק ${slots} מקומות בגלריה. ${result.skippedCount} לא הועלו.`
                    : null
            );
        } finally {
            setPicking(false);
        }
    };

    const run = async (id: string, action: (token: string) => Promise<unknown>, failMessage: string) => {
        setError(null);
        setBusyId(id);
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');
            await action(token);
            await afterChange();
        } catch (e) {
            setError(e instanceof Error ? e.message : failMessage);
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = (photo: FieldPhoto) =>
        run(photo.id, (token) => fieldPhotosApi.remove(fieldId, photo.id, token), 'הסרת התמונה נכשלה');

    const handleMove = (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= photos.length) return;
        const next = [...photos];
        [next[index], next[target]] = [next[target], next[index]];
        setPhotos(next); // optimistic; reloaded from the server either way
        void run(
            photos[index].id,
            (token) => fieldPhotosApi.reorder(fieldId, next.map((p) => p.id), token),
            'שינוי הסדר נכשל'
        );
    };

    const locked = busyId !== null;
    const canAdd = !loading && !busy && !picking && slots > 0;

    return (
        <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-1 text-right">
                גלריית תמונות ({photos.length}/{MAX_FIELD_PHOTOS})
            </Text>
            <Text className="text-gray-400 text-xs mb-2 text-right">התמונה הראשונה היא התמונה הראשית של המגרש.</Text>

            {photos.map((photo, i) => (
                <View
                    key={photo.id}
                    className={`flex-row items-center p-2 mb-2 rounded-xl border ${i === 0 ? 'border-brand bg-brand-mist' : 'border-gray-200 bg-gray-50'}`}
                >
                    <Image
                        source={{ uri: fieldPhotoSrc(photo.url, 240) }}
                        style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: '#e5e7eb' }}
                        contentFit="cover"
                        recyclingKey={photo.id}
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel={`תמונה ${i + 1} מתוך ${photos.length}`}
                        accessibilityIgnoresInvertColors
                    />
                    <View className="flex-1 mx-3">
                        <Text className="text-gray-800 font-bold text-sm">
                            {i === 0 ? 'תמונה ראשית' : `תמונה ${i + 1}`}
                        </Text>
                    </View>
                    {photos.length > 1 ? (
                        <>
                            <TouchableOpacity
                                onPress={() => handleMove(i, -1)}
                                disabled={i === 0 || locked}
                                hitSlop={6}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: i === 0 || locked }}
                                accessibilityLabel={`הזזת תמונה ${i + 1} מקום אחד קדימה`}
                                className="w-10 h-10 items-center justify-center"
                            >
                                <FontAwesome name="arrow-up" size={15} color={i === 0 || locked ? '#d1d5db' : '#047857'} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleMove(i, 1)}
                                disabled={i === photos.length - 1 || locked}
                                hitSlop={6}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: i === photos.length - 1 || locked }}
                                accessibilityLabel={`הזזת תמונה ${i + 1} מקום אחד אחורה`}
                                className="w-10 h-10 items-center justify-center"
                            >
                                <FontAwesome name="arrow-down" size={15} color={i === photos.length - 1 || locked ? '#d1d5db' : '#047857'} />
                            </TouchableOpacity>
                        </>
                    ) : null}
                    <TouchableOpacity
                        onPress={() => void handleRemove(photo)}
                        disabled={locked}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: locked }}
                        accessibilityLabel={`הסרת תמונה ${i + 1}`}
                        className="w-10 h-10 items-center justify-center"
                    >
                        {busyId === photo.id ? (
                            <ActivityIndicator size="small" color="#dc2626" />
                        ) : (
                            <FontAwesome name="trash" size={15} color={locked ? '#d1d5db' : '#dc2626'} />
                        )}
                    </TouchableOpacity>
                </View>
            ))}

            <TouchableOpacity
                onPress={handlePick}
                disabled={!canAdd}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdd }}
                className="flex-row items-center justify-center py-3 rounded-xl border border-dashed border-gray-300"
            >
                {loading || busy || picking ? (
                    <ActivityIndicator size="small" color="#059669" />
                ) : (
                    <>
                        <FontAwesome name="plus" size={14} color={slots > 0 ? '#059669' : '#9ca3af'} />
                        <Text className={`text-xs font-bold mx-2 ${slots > 0 ? 'text-brand' : 'text-gray-400'}`}>
                            {slots > 0 ? 'הוספת תמונות' : 'הגלריה מלאה'}
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            <View accessibilityLiveRegion="polite">
                {uploading.length > 0 ? (
                    <Text className="text-gray-500 text-xs mt-2 text-right">
                        מעלה {uploading.length} {uploading.length === 1 ? 'תמונה' : 'תמונות'}...
                    </Text>
                ) : null}
                {notice ? <Text className="text-amber-700 text-xs mt-2 text-right">{notice}</Text> : null}
                {failed.length > 0 ? (
                    <Text className="text-red-600 text-xs mt-2 text-right">
                        {failed.length === 1 ? `העלאת "${failed[0].name}" נכשלה` : `העלאת ${failed.length} תמונות נכשלה`}
                    </Text>
                ) : null}
                {error ? <Text className="text-red-600 text-xs mt-2 text-right">{error}</Text> : null}
            </View>
        </View>
    );
}
