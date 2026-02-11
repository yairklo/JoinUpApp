import { apiClient } from './client';

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
