import { apiClient } from './client';

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

    search: (params: URLSearchParams) => {
        return apiClient<any[]>('/api/fields/search?' + params.toString());
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

    create: (data: { name: string; location: string; city?: string; type: 'open' | 'closed'; price?: number }, token: string) => {
        return apiClient<Field>('/api/fields', { method: 'POST', data, token });
    },

    update: (fieldId: string, data: Partial<{ name: string; location: string; city: string | null; type: 'open' | 'closed'; price: number; available: boolean }>, token: string) => {
        return apiClient<Field>(`/api/fields/${fieldId}`, { method: 'PUT', data, token });
    },
};
