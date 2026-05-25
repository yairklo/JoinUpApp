import { apiClient } from './client';

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
    }
};
