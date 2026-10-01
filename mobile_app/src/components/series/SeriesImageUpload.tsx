import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { seriesApi } from '@/services/api/series';
import { pickOneImage } from '@/utils/pickImage';

interface SeriesImageUploadProps {
    seriesId: string;
    image: string | null;
    onChange: (image: string | null) => void;
}

/** Group cover image uploader (organizer / manager). Uploads and removals hit the server immediately, like on web. */
export default function SeriesImageUpload({ seriesId, image, onChange }: SeriesImageUploadProps) {
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePick = async () => {
        setError(null);
        const picked = await pickOneImage();
        if (!picked) return;
        setBusy(true);
        try {
            const token = await getToken();
            if (!token) throw new Error(t('series.reauth', 'נדרש להתחבר מחדש'));
            const result = await seriesApi.uploadImage(seriesId, picked, token);
            onChange(result.imageUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('series.imageUploadError', 'העלאת התמונה נכשלה'));
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        setError(null);
        setBusy(true);
        try {
            const token = await getToken();
            if (!token) throw new Error(t('series.reauth', 'נדרש להתחבר מחדש'));
            await seriesApi.removeImage(seriesId, token);
            onChange(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('series.imageRemoveError', 'הסרת התמונה נכשלה'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <View className="mb-4">
            <Text className="text-gray-700 font-bold mb-2">{t('series.image', 'תמונת קבוצה')}</Text>
            <View className="w-full h-40 rounded-xl overflow-hidden bg-gray-100 items-center justify-center">
                {image ? (
                    <>
                        <Image source={{ uri: image }} className="w-full h-40" resizeMode="cover" />
                        <TouchableOpacity
                            onPress={handleRemove}
                            disabled={busy}
                            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/55 items-center justify-center"
                        >
                            {busy ? <ActivityIndicator size="small" color="#fff" /> : <FontAwesome name="trash" size={14} color="#fff" />}
                        </TouchableOpacity>
                        {!busy && (
                            <TouchableOpacity onPress={handlePick} className="absolute bottom-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg">
                                <Text className="text-brand text-xs font-bold">{t('series.replaceImage', 'החלף תמונה')}</Text>
                            </TouchableOpacity>
                        )}
                    </>
                ) : (
                    <TouchableOpacity onPress={handlePick} disabled={busy} className="items-center">
                        {busy ? (
                            <ActivityIndicator size="small" color="#059669" />
                        ) : (
                            <>
                                <FontAwesome name="camera" size={22} color="#9ca3af" />
                                <Text className="text-gray-500 text-sm font-bold mt-2">{t('series.uploadImage', 'העלאת תמונת קבוצה')}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
            </View>
            {error && <Text className="text-red-600 text-xs mt-2">{error}</Text>}
        </View>
    );
}
