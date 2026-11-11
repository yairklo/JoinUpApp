import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
    IMAGE_RESIZE_MAX_EDGE,
    IMAGE_RESIZE_JPEG_QUALITY,
    computeResizedDimensions,
} from '@joinup/shared/upload';
import type { ResizeFn } from '@/hooks/useFieldPhotoUpload';

/** "IMG_1234.HEIC" -> "IMG_1234.jpg"; a name with no extension just gains ".jpg". */
function jpegFileName(name: string): string {
    const trimmed = (name || '').trim();
    const dot = trimmed.lastIndexOf('.');
    const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
    return `${base || 'photo'}.jpg`;
}

/**
 * Scales a picked photo so its long edge is at most 1600px and re-encodes it as JPEG (~0.82) on
 * the device, before upload. Same targets and the same dimension maths as the web
 * (next_app/src/utils/resizeImage.ts); both come from shared/upload.js.
 *
 * Never throws: if the native module fails (or is missing from an older build), the original
 * photo is uploaded as it is and the server's type and size check remains the gate.
 *
 * expo-image-manipulator is a native module -- it needs a native build that includes it and
 * cannot be delivered by an OTA update to builds made before it was added.
 */
export const resizeImage: ResizeFn = async (asset) => {
    const original = { uri: asset.uri, name: asset.name, type: asset.mimeType, size: asset.size };
    try {
        const target = computeResizedDimensions(asset.width, asset.height, IMAGE_RESIZE_MAX_EDGE);
        const context = ImageManipulator.manipulate(asset.uri);
        if (target.resized) context.resize({ width: target.width, height: target.height });
        const rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({ compress: IMAGE_RESIZE_JPEG_QUALITY, format: SaveFormat.JPEG });
        // The saved file's byte size is not reported; the server enforces the limit.
        return { uri: saved.uri, name: jpegFileName(asset.name), type: 'image/jpeg' };
    } catch {
        return original;
    }
};
