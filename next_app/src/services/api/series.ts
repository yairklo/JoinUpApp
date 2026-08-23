import { apiClient, API_BASE } from './client';

export interface SeriesPayload {
    type: 'WEEKLY' | 'CUSTOM';
    dates?: string[];
}

export interface UpdateSeriesDTO {
    time?: string;
    title?: string;
    description?: string;
    fieldId?: string | null;
    fieldName?: string;
    fieldLocation?: string;
    duration?: number;
    maxPlayers?: number;
    autoOpenRegistrationHours?: number | null;
    updateFutureGames?: boolean;
}

export const seriesApi = {
    createRecurrence: (gameId: string, payload: SeriesPayload, token: string) => {
        return apiClient<{ seriesId?: string; series?: { id: string } }>(`/api/games/${gameId}/recurrence`, {
            method: 'POST',
            data: payload,
            token
        });
    },

    update: (seriesId: string, data: UpdateSeriesDTO, token: string) => {
        return apiClient<{ series: unknown; updatedGames?: number }>(`/api/series/${seriesId}`, {
            method: 'PATCH',
            data,
            token
        });
    },

    toggleSubscribe: (seriesId: string, isSubscribed: boolean, token: string) => {
        return apiClient<{ ok?: boolean }>(`/api/series/${seriesId}/subscribe`, {
            method: isSubscribed ? 'DELETE' : 'POST',
            token
        });
    },

    addMembers: (seriesId: string, userIds: string[], token: string) => {
        return apiClient<{ ok: boolean; added: number }>(`/api/series/${seriesId}/members`, {
            method: 'POST',
            data: { userIds },
            token,
        });
    },

    setMemberRole: (seriesId: string, userId: string, role: 'MANAGER' | 'MEMBER', token: string) => {
        return apiClient<{ ok: boolean; userId: string; role: string }>(`/api/series/${seriesId}/members/${userId}`, {
            method: 'PATCH',
            data: { role },
            token,
        });
    },

    uploadImage: async (seriesId: string, file: File, token: string): Promise<{ imageUrl: string }> => {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(`${API_BASE}/api/series/${seriesId}/image`, {
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

    removeImage: (seriesId: string, token: string) => {
        return apiClient<{ imageUrl: null }>(`/api/series/${seriesId}/image`, {
            method: 'DELETE',
            token
        });
    }
};
