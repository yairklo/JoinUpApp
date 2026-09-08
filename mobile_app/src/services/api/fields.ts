import { apiClient, API_BASE } from './client';
import type { MapBounds } from '@/components/map/types';

export interface Field {
    id: string;
    name: string;
    location?: string | null;
    type?: 'open' | 'closed';
    description?: string | null;
    price?: number;
    rating?: number;
    image?: string | null;
    photos?: string[];
    supportedSports?: string[];
    city?: string | null;
    neighborhood?: string | null;
    street?: string | null;
    streetNumber?: string | null;
    phone?: string | null;
    email?: string | null;
    favoritesCount?: number;
    lat?: number | null;
    lng?: number | null;
    available?: boolean;
}

// Optional detail fields shared by create/update, all backed by columns that
// already exist on the Prisma Field model (see server/routes/fields.js). Mirrors
// next_app/src/services/api/fields.ts's FieldWriteData.
export interface FieldWriteData {
    city?: string;
    price?: number;
    description?: string;
    supportedSports?: ('SOCCER' | 'BASKETBALL' | 'TENNIS')[];
    phone?: string;
    email?: string;
    neighborhood?: string;
    street?: string;
    streetNumber?: string;
    lat?: number;
    lng?: number;
}

/** A locally-picked image (from expo-image-picker) ready for a multipart upload. */
export interface PickedImage {
    uri: string;
    name: string;
    type: string;
}

export interface BusyCell {
    avg: number | null;
    samples: number;
}

export interface FieldScheduleGame {
    id: string;
    title?: string | null;
    start: string;
    duration: number;
    sport: string;
    maxPlayers: number;
    price?: number | null;
    joinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    confirmedCount: number;
    // Injected by apiClient's timezone mapper from `start`
    date?: string;
    time?: string;
}

export interface FieldAnalytics {
    schedule: FieldScheduleGame[];
    busyProfile: BusyCell[][]; // [dayOfWeek 0-6][hour 0-23]
    totalReports: number;
    reportWindowDays: number;
}

export interface FieldsPage {
    items: Field[];
    total: number;
    hasMore: boolean;
}

export interface FieldComment {
    id: string;
    text: string;
    createdAt: string;
    user: { id: string; name?: string | null; imageUrl?: string | null };
}

export type FieldIssueCategory = 'POTHOLE' | 'LIGHTING' | 'SURFACE' | 'GOAL_NET' | 'FENCE' | 'OTHER';
export type FieldIssueStatus = 'OPEN' | 'RESOLVED';

export interface FieldIssueReport {
    id: string;
    category: FieldIssueCategory;
    description?: string | null;
    status: FieldIssueStatus;
    createdAt: string;
}

export const fieldsApi = {
    getAll: () => {
        return apiClient<Field[]>('/api/fields', { cache: 'no-store' });
    },

    // Paginated/filtered variant of getAll — mirrors next_app's fieldsApi.getPage
    // against the same `/api/fields?take=&skip=&q=&city=` endpoint, so callers
    // don't have to fetch and filter the entire (900+ row) table client-side.
    getPage: ({ take, skip, q, sport, city, includeUnavailable, token }: {
        take: number;
        skip: number;
        q?: string;
        sport?: string;
        city?: string;
        includeUnavailable?: boolean;
        token?: string;
    }) => {
        const params = new URLSearchParams({ take: String(take), skip: String(skip) });
        if (q) params.set('q', q);
        if (sport && sport !== 'ALL') params.set('sport', sport);
        if (city) params.set('city', city);
        if (includeUnavailable) params.set('includeUnavailable', 'true');
        return apiClient<FieldsPage>(`/api/fields?${params.toString()}`, { token, cache: 'no-store' });
    },

    getById: (fieldId: string) => {
        return apiClient<Field>(`/api/fields/${fieldId}`, { cache: 'no-store' });
    },

    getCities: () => {
        return apiClient<string[]>('/api/fields/cities');
    },

    search: (params: URLSearchParams) => {
        return apiClient<any[]>('/api/fields/search?' + params.toString());
    },

    /** Slim bbox-only query for map markers (no _count aggregations). */
    searchMap: (bounds: MapBounds, signal?: AbortSignal) => {
        const params = new URLSearchParams();
        params.append('minLat', bounds.minLat.toString());
        params.append('maxLat', bounds.maxLat.toString());
        params.append('minLng', bounds.minLng.toString());
        params.append('maxLng', bounds.maxLng.toString());
        return apiClient<Field[]>('/api/fields/map?' + params.toString(), {
            cache: 'no-store',
            signal,
        });
    },

    getAnalytics: (fieldId: string, token: string) => {
        return apiClient<FieldAnalytics>(`/api/fields/${fieldId}/analytics`, { token, cache: 'no-store' });
    },

    submitReport: (fieldId: string, busyLevel: number, token: string) => {
        return apiClient<{ ok: boolean; throttled: boolean }>(`/api/fields/${fieldId}/report`, {
            data: { busyLevel },
            token
        });
    },

    getComments: (fieldId: string) => {
        return apiClient<FieldComment[]>(`/api/fields/${fieldId}/comments`, { cache: 'no-store' });
    },

    addComment: (fieldId: string, text: string, token: string) => {
        return apiClient<FieldComment>(`/api/fields/${fieldId}/comments`, { method: 'POST', data: { text }, token });
    },

    deleteComment: (fieldId: string, commentId: string, token: string) => {
        return apiClient<{ message: string }>(`/api/fields/${fieldId}/comments/${commentId}`, { method: 'DELETE', token });
    },

    getIssues: (fieldId: string) => {
        return apiClient<FieldIssueReport[]>(`/api/fields/${fieldId}/issues`, { cache: 'no-store' });
    },

    addIssue: (fieldId: string, data: { category: FieldIssueCategory; description?: string }, token: string) => {
        return apiClient<FieldIssueReport>(`/api/fields/${fieldId}/issues`, { method: 'POST', data, token });
    },

    // --- Admin-only (requireAdmin on the server; the token must belong to an admin user) ---

    listForAdmin: (token: string) => {
        return apiClient<Field[]>('/api/fields?includeUnavailable=true', { token, cache: 'no-store' });
    },

    create: (data: FieldWriteData & { name: string; location: string; type: 'open' | 'closed' }, token: string) => {
        return apiClient<Field>('/api/fields', { method: 'POST', data, token });
    },

    update: (fieldId: string, data: Partial<FieldWriteData & { name: string; location: string; type: 'open' | 'closed'; available: boolean }>, token: string) => {
        return apiClient<Field>(`/api/fields/${fieldId}`, { method: 'PUT', data, token });
    },

    delete: (fieldId: string, token: string) => {
        return apiClient<{ message: string }>(`/api/fields/${fieldId}`, { method: 'DELETE', token });
    },

    // RN's fetch/FormData needs { uri, name, type } for a file part, not a web File object.
    uploadImage: async (fieldId: string, image: PickedImage, token: string): Promise<{ image: string }> => {
        const formData = new FormData();
        formData.append('image', image as unknown as Blob);
        const res = await fetch(`${API_BASE}/api/fields/${fieldId}/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to upload image');
        }
        return res.json();
    },

    removeImage: (fieldId: string, token: string) => {
        return apiClient<{ image: null }>(`/api/fields/${fieldId}/image`, { method: 'DELETE', token });
    },

    addPhoto: async (fieldId: string, image: PickedImage, token: string): Promise<Field> => {
        const formData = new FormData();
        formData.append('photo', image as unknown as Blob);
        const res = await fetch(`${API_BASE}/api/fields/${fieldId}/photos`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to add photo');
        }
        return res.json();
    },

    removePhoto: (fieldId: string, url: string, token: string) => {
        return apiClient<Field>(`/api/fields/${fieldId}/photos`, { method: 'DELETE', data: { url }, token });
    },
};
