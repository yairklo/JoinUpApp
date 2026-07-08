import { apiClient } from './client';

export interface GameRatingTeammate {
    id: string;
    name: string | null;
    imageUrl?: string | null;
    myScore: number | null;
}

export interface GameRatingsPayload {
    eligible: boolean;
    teammates: GameRatingTeammate[];
}

export const ratingsApi = {
    ratePlayer: (
        targetId: string,
        data: { gameId: string; score: number },
        token: string
    ) =>
        apiClient<{ ok: boolean }>(`/api/users/${targetId}/rate`, {
            method: 'POST',
            data,
            token,
        }),

    getGameRatings: (gameId: string, token: string) =>
        apiClient<GameRatingsPayload>(`/api/games/${gameId}/ratings`, { token }),
};
