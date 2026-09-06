import { apiClient, API_BASE } from './client';

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
    favoritesCount?: number;
    lat?: number | null;
    lng?: number | null;
    available?: boolean;
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

export const fieldsApi = {
    getAll: () => {
        return apiClient<Field[]>('/api/fields', { cache: 'no-store' });
    },

    listForAdmin: (token: string) => {
        return apiClient<Field[]>('/api/fields?includeUnavailable=true', { token, cache: 'no-store' });
    },

    getById: (fieldId: string) => {
        return apiClient<Field>(`/api/fields/${fieldId}`, { cache: 'no-store' });
    },

    getCities: () => {
        return apiClient<string[]>('/api/fields/cities');
    },

    search: (params: URLSearchParams, signal?: AbortSignal) => {
        return apiClient<any[]>('/api/fields/search?' + params.toString(), { signal });
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

    create: (data: FieldWriteData & { name: string; location: string; type: 'open' | 'closed' }, token: string) => {
        return apiClient<Field>('/api/fields', { method: 'POST', data, token });
    },

    update: (fieldId: string, data: Partial<FieldWriteData & { name: string; location: string; type: 'open' | 'closed'; available: boolean }>, token: string) => {
        return apiClient<Field>(`/api/fields/${fieldId}`, { method: 'PUT', data, token });
    },

    delete: (fieldId: string, token: string) => {
        return apiClient<{ message: string }>(`/api/fields/${fieldId}`, { method: 'DELETE', token });
    },

    uploadImage: async (fieldId: string, file: File, token: string): Promise<{ image: string }> => {
        const formData = new FormData();
        formData.append('image', file);
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

    addPhoto: async (fieldId: string, file: File, token: string): Promise<Field> => {
        const formData = new FormData();
        formData.append('photo', file);
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

// Optional detail fields shared by create/update, all backed by columns that
// already exist on the Prisma Field model (see server/routes/fields.js).
interface FieldWriteData {
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
