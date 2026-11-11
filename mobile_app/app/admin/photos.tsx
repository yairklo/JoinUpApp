import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { MAX_FIELD_PHOTOS } from '@joinup/shared/upload';
import BackButton from '@/components/ui/BackButton';
import FieldPhotoViewer from '@/components/fields/FieldPhotoViewer';
import { fieldPhotosApi, fieldPhotoSrc, type PendingFieldPhoto } from '@/services/api/fieldPhotos';
import { appAlert } from '@/i18n/appAlert';

/**
 * Admin queue for photos users suggested for a field (gated by app/admin/_layout.tsx). Approving
 * publishes the photo at the end of the field's gallery; rejecting deletes the stored image. Both
 * free the uploader's pending slot. Mirrors next_app's PendingFieldPhotosPanel; like the rest of
 * the admin area, the copy is Hebrew only.
 */
export default function AdminPendingPhotosScreen() {
    const router = useRouter();
    const { getToken } = useAuth();
    const [photos, setPhotos] = useState<PendingFieldPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [viewing, setViewing] = useState<PendingFieldPhoto | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            setPhotos(await fieldPhotosApi.listPending(token));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'טעינת התמונות נכשלה');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getToken]);

    useEffect(() => {
        void load();
    }, [load]);

    // Optimistic: the row leaves at once and comes back, with an error, if the server refuses.
    const resolve = async (photo: PendingFieldPhoto, action: 'approve' | 'reject') => {
        const before = photos;
        setBusyId(photo.id);
        setPhotos((prev) =>
            prev
                .filter((p) => p.id !== photo.id)
                // Approving uses one of the field's slots, which matters to its other pending photos.
                .map((p) =>
                    action === 'approve' && p.field.id === photo.field.id
                        ? { ...p, field: { ...p.field, approvedCount: p.field.approvedCount + 1 } }
                        : p
                )
        );
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');
            await fieldPhotosApi[action](photo.id, token);
            setError(null);
        } catch (e) {
            setPhotos(before);
            setError(e instanceof Error ? e.message : action === 'approve' ? 'אישור התמונה נכשל' : 'דחיית התמונה נכשלה');
        } finally {
            setBusyId(null);
        }
    };

    const confirmReject = (photo: PendingFieldPhoto) => {
        appAlert('דחיית תמונה', `לדחות את התמונה שהוצעה ל"${photo.field.name}"? התמונה תימחק.`, [
            { text: 'ביטול', style: 'cancel' },
            { text: 'דחייה', style: 'destructive', onPress: () => void resolve(photo, 'reject') },
        ]);
    };

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <BackButton className="me-3" />
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1} accessibilityRole="header">
                    תמונות שממתינות לאישור
                </Text>
                {photos.length > 0 ? (
                    <View className="px-2.5 py-0.5 rounded-full bg-amber-500">
                        <Text className="text-white text-xs font-bold">{photos.length}</Text>
                    </View>
                ) : null}
            </View>

            {error ? (
                <View className="mx-4 mt-3 p-3 rounded-xl bg-red-50" accessibilityLiveRegion="polite">
                    <Text className="text-red-700 text-sm">{error}</Text>
                </View>
            ) : null}

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#059669" />
                </View>
            ) : (
                <FlatList
                    data={photos}
                    keyExtractor={(p) => p.id}
                    contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                void load();
                            }}
                            tintColor="#059669"
                        />
                    }
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center py-16">
                            <FontAwesome name="check-circle" size={36} color="#a7f3d0" />
                            <Text className="text-gray-500 mt-3">אין תמונות שממתינות לאישור</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const full = item.field.approvedCount >= MAX_FIELD_PHOTOS;
                        const busy = busyId === item.id;
                        return (
                            <View className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                                <Pressable
                                    onPress={() => setViewing(item)}
                                    accessibilityRole="imagebutton"
                                    accessibilityLabel={`תמונה שהוצעה ל${item.field.name}`}
                                    accessibilityHint="הקשה פותחת את התמונה במסך מלא"
                                >
                                    <Image
                                        source={{ uri: fieldPhotoSrc(item.url, 800) }}
                                        style={{ width: '100%', height: 180, backgroundColor: '#e5e7eb' }}
                                        contentFit="cover"
                                        transition={150}
                                        recyclingKey={item.id}
                                        accessibilityIgnoresInvertColors
                                    />
                                </Pressable>
                                <View className="p-3">
                                    <TouchableOpacity
                                        onPress={() => router.push(`/field/${item.field.id}`)}
                                        accessibilityRole="link"
                                    >
                                        <Text className="font-bold text-gray-900">{item.field.name}</Text>
                                    </TouchableOpacity>
                                    <Text className="text-gray-500 text-xs mt-0.5">
                                        {item.uploader?.name || 'משתמש'} · {new Date(item.createdAt).toLocaleDateString('he-IL')}
                                    </Text>
                                    <Text className={`text-xs mt-1 ${full ? 'text-red-600' : 'text-gray-500'}`}>
                                        {`${item.field.approvedCount}/${MAX_FIELD_PHOTOS} תמונות בגלריה`}
                                        {full ? '. הגלריה מלאה - יש להסיר קודם תמונה קיימת.' : ''}
                                    </Text>
                                    <View className="flex-row mt-3" style={{ gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => void resolve(item, 'approve')}
                                            disabled={full || busy}
                                            accessibilityRole="button"
                                            accessibilityState={{ disabled: full || busy }}
                                            accessibilityLabel={`אישור התמונה של ${item.field.name}`}
                                            className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ${full || busy ? 'bg-gray-300' : 'bg-brand'}`}
                                        >
                                            <FontAwesome name="check" size={13} color="#fff" />
                                            <Text className="text-white font-bold mx-2">אישור</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => confirmReject(item)}
                                            disabled={busy}
                                            accessibilityRole="button"
                                            accessibilityState={{ disabled: busy }}
                                            accessibilityLabel={`דחיית התמונה של ${item.field.name}`}
                                            className="flex-1 flex-row items-center justify-center py-3 rounded-xl border border-red-300 bg-white"
                                        >
                                            <FontAwesome name="times" size={13} color="#dc2626" />
                                            <Text className="text-red-600 font-bold mx-2">דחייה</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                />
            )}

            <FieldPhotoViewer
                visible={!!viewing}
                onClose={() => setViewing(null)}
                fieldName={viewing?.field.name ?? ''}
                photos={viewing ? [{ id: viewing.id, url: viewing.url }] : []}
                startIndex={0}
            />
        </SafeAreaView>
    );
}
