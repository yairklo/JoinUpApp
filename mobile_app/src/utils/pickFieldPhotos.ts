import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import i18n from '@/i18n';
import { appAlert } from '@/i18n/appAlert';

/** One image chosen in the system picker, before any resize. */
export interface PickedAsset {
    uri: string;
    name: string;
    mimeType: string;
    width: number;
    height: number;
    /** Bytes, when the platform reports it. */
    size?: number;
}

/** The most the system picker is asked to allow in one go. */
const PICKER_MAX = 10;

/**
 * Multi-select counterpart of utils/pickImage.ts's pickOneImage. Returns every picked image
 * without validating it -- the caller decides per file, so one bad file never cancels the batch --
 * or null when the user cancelled or refused permission.
 *
 * `quality: 1` because compression now happens in the resize step; compressing here as well would
 * degrade the image twice.
 */
export async function pickFieldPhotos(remaining: number): Promise<PickedAsset[] | null> {
    // Android launches the system photo picker, which needs no storage permission (READ/WRITE_EXTERNAL_STORAGE
    // are blocked in app.json); asking would be denied on Android 12 and below.
    const permission = Platform.OS === 'android' ? null : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission && !permission.granted) {
        appAlert(
            i18n.t('upload.permissionRequired', 'נדרשת הרשאה'),
            i18n.t('upload.permissionMessage', 'כדי לצרף תמונה יש לאשר גישה לגלריית התמונות בהגדרות המכשיר')
        );
        return null;
    }

    const limit = Math.max(1, Math.min(PICKER_MAX, Math.floor(remaining) || 1));
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: limit > 1,
        // A hint to the system picker; not every Android picker enforces it, so the caller still trims.
        selectionLimit: limit,
        orderedSelection: true,
        quality: 1,
        allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return null;

    return result.assets.map((asset, i) => {
        const mimeType = asset.mimeType || 'image/jpeg';
        return {
            uri: asset.uri,
            name: asset.fileName || `photo-${Date.now()}-${i}.${mimeType.split('/')[1] || 'jpg'}`,
            mimeType,
            width: asset.width,
            height: asset.height,
            size: typeof asset.fileSize === 'number' ? asset.fileSize : undefined,
        };
    });
}
