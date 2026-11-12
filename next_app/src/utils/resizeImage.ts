import {
    IMAGE_RESIZE_MAX_EDGE,
    IMAGE_RESIZE_JPEG_QUALITY,
    computeResizedDimensions,
} from "@joinup/shared/upload";

/** "IMG_1234.HEIC" -> "IMG_1234.jpg"; a name with no extension just gains ".jpg". */
export function jpegFileName(name: string): string {
    const trimmed = (name || "").trim();
    const dot = trimmed.lastIndexOf(".");
    const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
    return `${base || "photo"}.jpg`;
}

/**
 * Whether the re-encoded copy should replace the original. A copy that was scaled down always
 * wins. One that kept its dimensions only wins when it is actually smaller -- re-encoding an
 * already well-compressed small image can make it bigger for no gain.
 */
export function shouldUseResizedCopy(opts: { resized: boolean; originalSize: number; resultSize: number }): boolean {
    if (opts.resultSize <= 0) return false;
    return opts.resized || opts.resultSize < opts.originalSize;
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded> {
    if (typeof createImageBitmap === "function") {
        try {
            // 'from-image' applies the EXIF rotation, so portrait phone photos stay upright.
            const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
            return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
        } catch {
            // Fall through to <img>: some browsers reject the options bag or the format.
        }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("decode failed"));
            el.src = url;
        });
        return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
    }
}

/**
 * Scales an image so its long edge is at most 1600px and re-encodes it as JPEG (~0.82), in the
 * browser, before upload. Never throws: anything that cannot be decoded or encoded is returned
 * unchanged, leaving the server's type and size check as the single gate. An animated GIF is
 * flattened to its first frame, which is what a field photo should be anyway.
 */
export async function resizeImageFile(file: File): Promise<File> {
    let decoded: Decoded | null = null;
    try {
        decoded = await decode(file);
        const target = computeResizedDimensions(decoded.width, decoded.height, IMAGE_RESIZE_MAX_EDGE);
        if (target.width === 0 || target.height === 0) return file;

        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        // JPEG has no alpha; without a fill, transparent PNG areas would come out black.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(decoded.source, 0, 0, target.width, target.height);

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", IMAGE_RESIZE_JPEG_QUALITY),
        );
        if (!blob) return file;
        if (!shouldUseResizedCopy({ resized: target.resized, originalSize: file.size, resultSize: blob.size })) {
            return file;
        }
        return new File([blob], jpegFileName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
    } catch {
        return file;
    } finally {
        decoded?.release();
    }
}
