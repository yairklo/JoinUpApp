import { apiClient } from './client';

export interface AdminSettings {
    tournamentsPublic: boolean;
}

export const adminSettingsApi = {
    get: (token: string) => apiClient<AdminSettings>('/api/admin/settings', { token, cache: 'no-store' }),
    update: (data: Partial<AdminSettings>, token: string) =>
        apiClient<AdminSettings>('/api/admin/settings', { method: 'PUT', data, token }),
};
