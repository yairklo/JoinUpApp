import { apiClient } from './client';
import { Game, JoinRequest } from '@/types/game';

export interface UpdateGameDTO {
    time?: string;
    date?: string;
    maxPlayers?: number;
    sport?: string;
    title?: string;
    teamSize?: number | null;
    price?: number | null;
    isFriendsOnly?: boolean;
    joinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    registrationOpensAt?: string | null;
    friendsOnlyUntil?: string | null;
}

export interface JoinGameResponse extends Game {
    pending?: boolean;
}

export const gamesApi = {
    // GET Methods
    search: (params: URLSearchParams, token?: string) => {
        const endpoint = token ? '/api/games/search' : '/api/games/public';
        const search = params.toString();
        // Prevent appending ? if params empty, though unlikely here
        return apiClient<Game[]>(search ? `${endpoint}?${search}` : endpoint, { token });
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
    },

    saveTeams: (gameId: string, teams: any, token: string) => {
        return apiClient(`/api/games/${gameId}/teams`, {
            method: 'PUT',
            data: { teams },
            token
        });
    },

    addManager: (gameId: string, userId: string, token: string) => {
        return apiClient(`/api/games/${gameId}/roles`, {
            method: 'POST',
            data: { userId, role: 'MANAGER' },
            token
        });
    },

    removeManager: (gameId: string, userId: string, token: string) => {
        return apiClient(`/api/games/${gameId}/roles/${userId}`, {
            method: 'DELETE',
            token
        });
    },

    getById: (gameId: string, token?: string) => {
        return apiClient<Game>(`/api/games/${gameId}`, { token });
    },

    join: (gameId: string, token: string) => {
        return apiClient<JoinGameResponse>(`/api/games/${gameId}/join`, {
            method: 'POST',
            token
        });
    },

    getJoinRequests: (gameId: string, token: string) => {
        return apiClient<{ requests: JoinRequest[] }>(`/api/games/${gameId}/join-requests`, { token });
    },

    approveJoinRequest: (gameId: string, userId: string, token: string) => {
        return apiClient<Game>(`/api/games/${gameId}/join-requests/${userId}/approve`, {
            method: 'POST',
            token
        });
    },

    rejectJoinRequest: (gameId: string, userId: string, token: string) => {
        return apiClient<Game>(`/api/games/${gameId}/join-requests/${userId}/reject`, {
            method: 'POST',
            token
        });
    },

    leave: (gameId: string, token: string) => {
        return apiClient<Game>(`/api/games/${gameId}/leave`, {
            method: 'POST',
            token
        });
    },

    getGameForChat: (gameId: string, token: string, silent: boolean = false) => {
        return apiClient<Game>(`/api/games/${gameId}`, { token, silent });
    }
};
