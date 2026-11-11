import { apiClient, API_BASE } from './client';

export type FieldPhotoStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface FieldPhoto {
    id: string;
    url: string;
    status: FieldPhotoStatus;
    sortOrder: number;
    createdAt: string;
}

export interface FieldPhotosResponse {
    /** Approved photos, in display order. The only list guests and other users ever get. */
    photos: FieldPhoto[];
    /** The signed-in viewer's own photos still awaiting review. Empty for guests. */
    mine: FieldPhoto[];
    /** How many more photos the viewer may add right now; null for guests. */
    remaining: number | null;
    /** The field already shows the maximum number of approved photos. */
    fieldFull: boolean;
}

export interface PendingFieldPhoto extends FieldPhoto {
    field: { id: string; name: string; approvedCount: number };
    uploader: { id: string; name: string | null } | null;
}

/** A local image ready for a multipart upload (same shape as fields.ts's PickedImage). */
export interface LocalPhoto {
    uri: string;
    name: string;
    type: string;
}

export type UploadError = Error & { status?: number; code?: string };

const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Cloudinary delivery URL sized for where it is shown (`f_auto,q_auto` picks the best format and
 * quality per device). Any URL that is not a plain Cloudinary upload URL is returned untouched.
 * Mirrors next_app/src/services/api/fieldPhotos.ts.
 */
export function fieldPhotoSrc(url: string, width: number): string {
    const marker = '/image/upload/';
    const at = url.indexOf(marker);
    if (at === -1 || !/^https:\/\/res\.cloudinary\.com\//.test(url)) return url;
    const rest = url.slice(at + marker.length);
    // Already transformed (first segment is neither a version nor our folder): leave it alone.
    if (/^[a-z]{1,3}_[^/]*\//.test(rest)) return url;
    return `${url.slice(0, at + marker.length)}f_auto,q_auto,c_limit,w_${Math.round(width)}/${rest}`;
}

export const fieldPhotosApi = {
    /** With a token the response also carries the viewer's own pending photos. */
    list: (fieldId: string, token?: string | null) =>
        apiClient<FieldPhotosResponse>(`/api/fields/${fieldId}/photos`, token ? { token } : {}),

    /**
     * Uploads one photo. XMLHttpRequest rather than the shared uploadMultipart helper because
     * fetch cannot report upload progress, and each file in a batch shows its own bar.
     */
    upload: (fieldId: string, photo: LocalPhoto, token: string, onProgress?: (percent: number) => void) =>
        new Promise<FieldPhoto>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE}/api/fields/${fieldId}/photos/submit`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.timeout = UPLOAD_TIMEOUT_MS;
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
            };
            const fail = (status: number, body?: { error?: string; code?: string } | null) => {
                const err = new Error(body?.error || 'Failed to upload photo') as UploadError;
                err.status = status;
                if (typeof body?.code === 'string') err.code = body.code;
                reject(err);
            };
            xhr.onload = () => {
                let body: any = null;
                try {
                    body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
                } catch {
                    body = null;
                }
                if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body as FieldPhoto);
                else fail(xhr.status, body);
            };
            xhr.onerror = () => fail(0);
            xhr.onabort = () => fail(0);
            xhr.ontimeout = () => fail(0);
            const form = new FormData();
            // React Native's FormData takes a { uri, name, type } descriptor in place of a Blob.
            form.append('photo', photo as unknown as Blob);
            xhr.send(form);
        }),

    /** The uploader removes their own pending photo; an admin may remove any. */
    remove: (fieldId: string, photoId: string, token: string) =>
        apiClient<{ ok: true }>(`/api/fields/${fieldId}/photos/${photoId}`, { method: 'DELETE', token }),

    // ---- admin ----
    listPending: (token: string) => apiClient<PendingFieldPhoto[]>('/api/field-photos/pending', { token }),

    approve: (photoId: string, token: string) =>
        apiClient<FieldPhoto>(`/api/field-photos/${photoId}/approve`, { method: 'POST', token }),

    reject: (photoId: string, token: string) =>
        apiClient<FieldPhoto>(`/api/field-photos/${photoId}/reject`, { method: 'POST', token }),

    /** `orderedIds` must be exactly the field's approved photo ids, in the new order. */
    reorder: (fieldId: string, orderedIds: string[], token: string) =>
        apiClient<FieldPhoto[]>(`/api/fields/${fieldId}/photos/order`, { method: 'PUT', data: { orderedIds }, token }),
};
