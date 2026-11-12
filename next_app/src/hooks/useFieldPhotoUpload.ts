"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
    MAX_IMAGE_FILE_SIZE,
    planFieldPhotoBatch,
    fieldPhotoErrorKind,
    type FieldPhotoErrorKind,
} from "@joinup/shared/upload";
import { fieldPhotosApi, type FieldPhoto, type UploadError } from "@/services/api/fieldPhotos";
import { resizeImageFile } from "@/utils/resizeImage";

export type UploadItemStatus = "queued" | "resizing" | "uploading" | "done" | "error";

export interface UploadItem {
    id: string;
    name: string;
    previewUrl: string | null;
    status: UploadItemStatus;
    /** 0-100, meaningful while uploading. */
    progress: number;
    errorKind: FieldPhotoErrorKind | null;
}

export interface AddFilesResult {
    /** Valid files that were not sent because there were no slots left for them. */
    skippedCount: number;
    /** Files with an unsupported type (listed as failed rows, not sent). */
    invalidCount: number;
    /** Files queued for upload. */
    acceptedCount: number;
}

/** Errors where trying the same file again can succeed. A limit or a bad type will not change. */
const RETRYABLE: FieldPhotoErrorKind[] = ["NETWORK", "RATE", "UNKNOWN", "AUTH"];
export const isRetryable = (kind: FieldPhotoErrorKind | null) => !!kind && RETRYABLE.includes(kind);

let nextId = 0;

/**
 * Multi-file field-photo upload: validates and trims a selection to the slots left, then resizes
 * and uploads the files one at a time, exposing a row per file with its own progress and error.
 * Sequential on purpose -- the server counts each upload against the user's limits, and a parallel
 * burst would race those counts and trip the rate limiter.
 */
export function useFieldPhotoUpload(fieldId: string, onUploaded?: (photo: FieldPhoto) => void) {
    const { getToken } = useAuth();
    const [items, setItems] = useState<UploadItem[]>([]);
    const files = useRef(new Map<string, File>());
    const queue = useRef<string[]>([]);
    const running = useRef(false);
    const alive = useRef(true);
    const onUploadedRef = useRef(onUploaded);
    onUploadedRef.current = onUploaded;

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
                const original = files.current.get(id);
                if (!original) continue;
                try {
                    patch(id, { status: "resizing", progress: 0, errorKind: null });
                    const file = await resizeImageFile(original);
                    if (file.size > MAX_IMAGE_FILE_SIZE) {
                        patch(id, { status: "error", errorKind: "SIZE" });
                        continue;
                    }
                    const token = await getToken();
                    if (!token) {
                        patch(id, { status: "error", errorKind: "AUTH" });
                        continue;
                    }
                    patch(id, { status: "uploading" });
                    const photo = await fieldPhotosApi.upload(fieldId, file, token, (progress) => patch(id, { progress }));
                    patch(id, { status: "done", progress: 100 });
                    files.current.delete(id);
                    onUploadedRef.current?.(photo);
                } catch (e) {
                    patch(id, { status: "error", errorKind: fieldPhotoErrorKind(e as UploadError) });
                }
            }
        } finally {
            running.current = false;
        }
    }, [fieldId, getToken, patch]);

    /** `remaining` is the number of slots the server last reported for this user and field. */
    const addFiles = useCallback(
        (selected: File[], remaining: number): AddFilesResult => {
            const plan = planFieldPhotoBatch(
                selected.map((f) => ({ mimetype: f.type, size: f.size })),
                remaining,
            );
            const invalidAt = new Map(plan.invalid.map((i) => [i.index, i.error]));
            const rows: UploadItem[] = [];
            const row = (index: number, status: UploadItemStatus, errorKind: FieldPhotoErrorKind | null): UploadItem => {
                const file = selected[index];
                return {
                    id: `u${nextId++}`,
                    name: file.name,
                    previewUrl: errorKind ? null : URL.createObjectURL(file),
                    status,
                    progress: 0,
                    errorKind,
                };
            };
            selected.forEach((file, index) => {
                if (invalidAt.has(index)) {
                    rows.push(row(index, "error", invalidAt.get(index) ?? "TYPE"));
                } else if (plan.accepted.includes(index)) {
                    const item = row(index, "queued", null);
                    files.current.set(item.id, file);
                    queue.current.push(item.id);
                    rows.push(item);
                }
                // Skipped files get no row: they are reported once, as a count, by the caller.
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
            if (!files.current.has(id) || queue.current.includes(id)) return;
            queue.current.push(id);
            patch(id, { status: "queued", progress: 0, errorKind: null });
            void pump();
        },
        [patch, pump],
    );

    const dismiss = useCallback((id: string) => {
        queue.current = queue.current.filter((q) => q !== id);
        files.current.delete(id);
        setItems((prev) => {
            const gone = prev.find((it) => it.id === id);
            if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
            return prev.filter((it) => it.id !== id);
        });
    }, []);

    /** Clears finished and failed rows; anything still in flight stays. */
    const clearSettled = useCallback(() => {
        setItems((prev) => {
            const keep: UploadItem[] = [];
            for (const it of prev) {
                if (it.status === "done" || it.status === "error") {
                    if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
                    files.current.delete(it.id);
                } else keep.push(it);
            }
            return keep;
        });
    }, []);

    const itemsRef = useRef(items);
    itemsRef.current = items;
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            queue.current = [];
            itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
        };
    }, []);

    const busy = items.some((it) => it.status === "queued" || it.status === "resizing" || it.status === "uploading");
    const doneCount = items.filter((it) => it.status === "done").length;

    return { items, busy, doneCount, addFiles, retry, dismiss, clearSettled };
}
