import { apiClient } from './client';

export interface Field {
    id: string;
    name: string;
    location?: string | null;
    type?: 'open' | 'closed';
}

export const fieldsApi = {
    getAll: () => {
        return apiClient<Field[]>('/api/fields', { cache: 'no-store' });
    },

    getCities: () => {
        return apiClient<string[]>('/api/fields/cities');
    }
};
