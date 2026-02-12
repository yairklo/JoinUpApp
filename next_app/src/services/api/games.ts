import { apiClient } from './client';
import { Game } from '@/types/game';

export interface UpdateGameDTO {
    time?: string;
    date?: string;
    maxPlayers?: number;
    sport?: string;
    title?: string;
    teamSize?: number | null;
    price?: number | null;
    isFriendsOnly?: boolean;
    registrationOpensAt?: string | null;
    friendsOnlyUntil?: string | null;
}

export const gamesApi = {
    // GET Methods
    search: (params: URLSearchParams, token?: string) => {
        const endpoint = token ? '/api/games/search' : '/api/games/public';
        return apiClient<Game[]>(`${endpoint}?${params.toString()}`, { token });
    },

    getMyGames: (token: string) => {
        return apiClient<Game[]>('/api/games/my', { token });
    },

    getByCity: (city: string, token?: string) => {
        return apiClient<Game[]>(`/api/games/city?city=${encodeURIComponent(city)}`, { token });
    },

    getByFriends: (token: string) => {
        return apiClient<Game[]>('/api/games/friends', { token });
    },

    // Mutation Methods
    create: (data: any, token: string) => {
        return apiClient<{ fieldId: string; id: string }>('/api/games', {
            method: 'POST',
            data,
            token
        });
    },

    update: (gameId: string, data: UpdateGameDTO, token: string) => {
        return apiClient(`/api/games/${gameId}`, {
            method: 'PATCH',
            data,
            token
        });
    },

    delete: (gameId: string, token: string) => {
        return apiClient(`/api/games/${gameId}`, {
            method: 'DELETE',
            token
        });
    }
};
