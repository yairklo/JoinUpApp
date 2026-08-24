import { apiClient } from './client';

export interface SeriesPayload {
    type: 'WEEKLY' | 'CUSTOM';
    dates?: string[];
}

export interface UpdateSeriesDTO {
    time?: string;
    title?: string;
    description?: string;
    updateFutureGames?: boolean;
}

export const seriesApi = {
    getById: (seriesId: string, token?: string) => {
        return apiClient<any>(`/api/series/${seriesId}`, { token });
    },

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

    delete: (seriesId: string, token: string) => {
        return apiClient(`/api/series/${seriesId}/delete`, {
            method: 'POST',
            data: { strategy: 'DELETE_ALL' },
            token
        });
    }
};
