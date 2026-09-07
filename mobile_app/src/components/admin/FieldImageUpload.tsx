import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@clerk/clerk-expo';
import { fieldsApi } from '@/services/api/fields';
import { pickOneImage } from '@/utils/pickImage';

interface FieldImageUploadProps {
    fieldId: string;
    image: string | null;
    onChange: (image: string | null) => void;
}

/** Single-slot main-image uploader for a field, alongside the multi-photo FieldPhotoGallery. */
export default function FieldImageUpload({ fieldId, image, onChange }: FieldImageUploadProps) {
    const { getToken } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePick = async () => {
        setError(null);
        const picked = await pickOneImage();
        if (!picked) return;

        setBusy(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');
            const result = await fieldsApi.uploadImage(fieldId, picked, token);
            onChange(result.image);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'העלאת התמונה נכשלה');
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        setError(null);
        setBusy(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('נדרש להתחבר מחדש');
            await fieldsApi.removeImage(fieldId, token);
            onChange(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'הסרת התמונה נכשלה');
        } finally {
            setBusy(false);
        }
    };

    return (
        <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-2 text-right">תמונה ראשית</Text>
            <View className="w-full h-40 rounded-xl overflow-hidden bg-gray-100 items-center justify-center relative">
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
                    </>
                ) : (
                    <TouchableOpacity onPress={handlePick} disabled={busy} className="items-center">
                        {busy ? (
                            <ActivityIndicator size="small" color="#059669" />
                        ) : (
                            <>
                                <FontAwesome name="camera" size={22} color="#9ca3af" />
                                <Text className="text-gray-500 text-sm font-bold mt-2">העלאת תמונה</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
                {image && !busy && (
                    <TouchableOpacity onPress={handlePick} className="absolute bottom-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg">
                        <Text className="text-brand text-xs font-bold">החלף תמונה</Text>
                    </TouchableOpacity>
                )}
            </View>
            {error && <Text className="text-red-600 text-xs mt-2 text-right">{error}</Text>}
        </View>
    );
}
