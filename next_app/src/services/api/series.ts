import { apiClient, API_BASE } from './client';

export interface SeriesPayload {
    type: 'WEEKLY' | 'CUSTOM';
    dates?: string[];
}

export interface UpdateSeriesDTO {
    time: string;
    updateFutureGames: boolean;
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
        return apiClient(`/api/series/${seriesId}`, {
            method: 'PATCH',
            data,
            token
        });
    },

    toggleSubscribe: (seriesId: string, isSubscribed: boolean, token: string) => {
        return apiClient(`/api/series/${seriesId}/subscribe`, {
            method: isSubscribed ? 'DELETE' : 'POST',
            token
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
