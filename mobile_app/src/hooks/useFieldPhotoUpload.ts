import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import {
    MAX_IMAGE_FILE_SIZE,
    planFieldPhotoBatch,
    fieldPhotoErrorKind,
    type FieldPhotoErrorKind,
} from '@joinup/shared/upload';
import { fieldPhotosApi, type FieldPhoto, type LocalPhoto, type UploadError } from '@/services/api/fieldPhotos';
import type { PickedAsset } from '@/utils/pickFieldPhotos';

export type UploadItemStatus = 'queued' | 'resizing' | 'uploading' | 'done' | 'error';

export interface UploadItem {
    id: string;
    name: string;
    previewUri: string;
    status: UploadItemStatus;
    /** 0-100, meaningful while uploading. */
    progress: number;
    errorKind: FieldPhotoErrorKind | null;
}

export interface AddAssetsResult {
    /** Valid photos that were not sent because there were no slots left for them. */
    skippedCount: number;
    /** Photos with an unsupported type (listed as failed rows, not sent). */
    invalidCount: number;
    acceptedCount: number;
}

/** Turns a picked asset into the file to upload. `size` is reported when known. */
export type ResizeFn = (asset: PickedAsset) => Promise<LocalPhoto & { size?: number }>;

/** Pass-through default; callers pass utils/resizeImage (expo-image-manipulator) for the real thing. */
const noResize: ResizeFn = async (asset) => ({ uri: asset.uri, name: asset.name, type: asset.mimeType, size: asset.size });

/** Errors where trying the same photo again can succeed. A limit or a bad type will not change. */
const RETRYABLE: FieldPhotoErrorKind[] = ['NETWORK', 'RATE', 'UNKNOWN', 'AUTH'];
export const isRetryable = (kind: FieldPhotoErrorKind | null) => !!kind && RETRYABLE.includes(kind);

let nextId = 0;

/**
 * Multi-photo field upload, mirroring next_app/src/hooks/useFieldPhotoUpload.ts: trims a
 * selection to the slots left, then resizes and uploads one photo at a time, with a row per photo
 * carrying its own progress and error. Sequential on purpose -- the server counts each upload
 * against the user's limits, and a parallel burst would race those counts and the rate limiter.
 */
export function useFieldPhotoUpload(
    fieldId: string,
    onUploaded?: (photo: FieldPhoto) => void,
    resize: ResizeFn = noResize,
) {
    const { getToken } = useAuth();
    const [items, setItems] = useState<UploadItem[]>([]);
    const assets = useRef(new Map<string, PickedAsset>());
    const queue = useRef<string[]>([]);
    const running = useRef(false);
    const alive = useRef(true);
    const onUploadedRef = useRef(onUploaded);
    onUploadedRef.current = onUploaded;
    const resizeRef = useRef(resize);
    resizeRef.current = resize;

    const patch = useCallback((id: string, change: Partial<UploadItem>) => {
        if (!alive.current) return;
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)));
    }, []);

    const pump = useCallback(async () => {
        if (running.current) return;
        running.current = true;
        try {
            while (queue.current.length > 0 && alive.current) {
                const id = queue.current.shift() as string;
                const asset = assets.current.get(id);
                if (!asset) continue;
                try {
                    patch(id, { status: 'resizing', progress: 0, errorKind: null });
                    const photo = await resizeRef.current(asset);
                    if (typeof photo.size === 'number' && photo.size > MAX_IMAGE_FILE_SIZE) {
                        patch(id, { status: 'error', errorKind: 'SIZE' });
                        continue;
                    }
                    const token = await getToken();
                    if (!token) {
                        patch(id, { status: 'error', errorKind: 'AUTH' });
                        continue;
                    }
                    patch(id, { status: 'uploading' });
                    const saved = await fieldPhotosApi.upload(
                        fieldId,
                        { uri: photo.uri, name: photo.name, type: photo.type },
                        token,
                        (progress) => patch(id, { progress }),
                    );
                    patch(id, { status: 'done', progress: 100 });
                    assets.current.delete(id);
                    onUploadedRef.current?.(saved);
                } catch (e) {
                    patch(id, { status: 'error', errorKind: fieldPhotoErrorKind(e as UploadError) });
                }
            }
        } finally {
            running.current = false;
        }
    }, [fieldId, getToken, patch]);

    /** `remaining` is the number of slots the server last reported for this user and field. */
    const addAssets = useCallback(
        (picked: PickedAsset[], remaining: number): AddAssetsResult => {
            const plan = planFieldPhotoBatch(
                picked.map((a) => ({ mimetype: a.mimeType, size: a.size })),
                remaining,
            );
            const invalidAt = new Map(plan.invalid.map((i) => [i.index, i.error]));
            const rows: UploadItem[] = [];
            picked.forEach((asset, index) => {
                const base = { id: `u${nextId++}`, name: asset.name, previewUri: asset.uri, progress: 0 };
                if (invalidAt.has(index)) {
                    rows.push({ ...base, status: 'error', errorKind: invalidAt.get(index) ?? 'TYPE' });
                } else if (plan.accepted.includes(index)) {
                    assets.current.set(base.id, asset);
                    queue.current.push(base.id);
                    rows.push({ ...base, status: 'queued', errorKind: null });
                }
                // Skipped photos get no row: they are reported once, as a count, by the caller.
            });
            setItems((prev) => [...prev, ...rows]);
            void pump();
            return {
                skippedCount: plan.skipped.length,
                invalidCount: plan.invalid.length,
                acceptedCount: plan.accepted.length,
            };
        },
        [pump],
    );

    const retry = useCallback(
        (id: string) => {
            if (!assets.current.has(id) || queue.current.includes(id)) return;
            queue.current.push(id);
            patch(id, { status: 'queued', progress: 0, errorKind: null });
            void pump();
        },
        [patch, pump],
    );

    const dismiss = useCallback((id: string) => {
        queue.current = queue.current.filter((q) => q !== id);
        assets.current.delete(id);
        setItems((prev) => prev.filter((it) => it.id !== id));
    }, []);

    /** Clears finished and failed rows; anything still in flight stays. */
    const clearSettled = useCallback(() => {
        setItems((prev) => {
            const keep = prev.filter((it) => it.status !== 'done' && it.status !== 'error');
            prev.forEach((it) => {
                if (!keep.includes(it)) assets.current.delete(it.id);
            });
            return keep;
        });
    }, []);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            queue.current = [];
        };
    }, []);

    const busy = items.some((it) => it.status === 'queued' || it.status === 'resizing' || it.status === 'uploading');
    const doneCount = items.filter((it) => it.status === 'done').length;

    return { items, busy, doneCount, addAssets, retry, dismiss, clearSettled };
}
