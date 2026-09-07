import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { fieldsApi } from '@/services/api/fields';
import { pickOneImage } from '@/utils/pickImage';

interface FieldPhotoGalleryProps {
    fieldId: string;
    photos: string[];
    onChange: (photos: string[]) => void;
}

/**
 * Mobile counterpart of next_app's FieldPhotoGallery
 * (next_app/src/components/admin/FieldPhotoGallery.tsx) -- same
 * POST/DELETE /api/fields/:id/photos backend, picking via expo-image-picker
 * instead of a browser <input type="file">.
 */
export default function FieldPhotoGallery({ fieldId, photos, onChange }: FieldPhotoGalleryProps) {
    const { getToken } = useAuth();
    const [busy, setBusy] = useState(false);
    const [removingUrl, setRemovingUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handlePick = async () => {
        setError(null);
        const image = await pickOneImage();
        if (!image) return;

        setBusy(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');
            const updated = await fieldsApi.addPhoto(fieldId, image, token);
            onChange(updated.photos || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'העלאת התמונה נכשלה');
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (url: string) => {
        setError(null);
        setRemovingUrl(url);
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');
            const updated = await fieldsApi.removePhoto(fieldId, url, token);
            onChange(updated.photos || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'הסרת התמונה נכשלה');
        } finally {
            setRemovingUrl(null);
        }
    };

    return (
        <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-2 text-right">גלריית תמונות ({photos.length})</Text>
            <View className="flex-row flex-wrap gap-2">
                {photos.map((url) => (
                    <View key={url} className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 relative">
                        <Image source={{ uri: url }} className="w-24 h-24" />
                        <TouchableOpacity
                            onPress={() => handleRemove(url)}
                            disabled={removingUrl === url}
                            className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/55 items-center justify-center"
                        >
                            {removingUrl === url ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <FontAwesome name="trash" size={12} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                ))}
                <TouchableOpacity
                    onPress={handlePick}
                    disabled={busy}
                    className="w-24 h-24 rounded-xl border border-dashed border-gray-300 items-center justify-center"
                >
                    {busy ? (
                        <ActivityIndicator size="small" color="#059669" />
                    ) : (
                        <>
                            <FontAwesome name="plus" size={16} color="#059669" />
                            <Text className="text-brand text-xs font-bold mt-1">הוסף</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
            {error && <Text className="text-red-600 text-xs mt-2 text-right">{error}</Text>}
        </View>
    );
}
