import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MAX_IMAGE_FILE_SIZE, ACCEPTED_IMAGE_TYPES } from '@joinup/shared/upload';
import type { PickedImage } from '@/services/api/fields';

/**
 * Shared by FieldPhotoGallery and FieldImageUpload (admin, mobile-only): asks for
 * gallery permission, launches the picker, and validates against the same limits
 * the server's upload middleware enforces (server/middleware/upload.js).
 */
export async function pickOneImage(): Promise<PickedImage | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        Alert.alert('נדרשת הרשאה', 'כדי לצרף תמונה יש לאשר גישה לגלריית התמונות בהגדרות המכשיר');
        return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return null;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    if (!ACCEPTED_IMAGE_TYPES.includes(mimeType)) {
        Alert.alert('סוג קובץ לא נתמך', 'ניתן להעלות תמונות מסוג JPEG, PNG, WEBP או GIF בלבד');
        return null;
    }
    if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_IMAGE_FILE_SIZE) {
        Alert.alert('הקובץ גדול מדי', 'גודל התמונה חייב להיות עד 5MB');
        return null;
    }

    const name = asset.fileName || `photo-${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;
    return { uri: asset.uri, name, type: mimeType };
}
