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
    joinPolicy?: 'INSTANT' | 'REQUIRES_APPROVAL';
    registrationOpensAt?: string | null;
    friendsOnlyUntil?: string | null;
    duration?: number;
    description?: string;
    welcomeMessage?: string;
    pickDrawAt?: string | null;
    pickingStartsAt?: string | null;
    fieldId?: string;
    newField?: { name: string; location: string; type?: 'open' | 'closed' };
    customLat?: number;
    customLng?: number;
    customLocation?: string;
}

export type PickSessionState = {
    gameId: string;
    organizerId: string;
    pickDrawAt: string | null;
    pickDrawExecutedAt: string | null;
    pickingStartsAt: string | null;
    pickingOpenedAt: string | null;
    pickSessionStatus: string;
    pickTurnOrder: string[];
    pickOrderType: string;
    pickCurrentTurnIndex: number;
    currentTurnManagerId: string | null;
    managers: { id: string; name?: string | null; avatar?: string | null; isOrganizer?: boolean }[];
    teams: {
        id: string;
        name: string;
        color: string;
        managerId?: string | null;
        playerIds: string[];
        players: { id: string; name?: string | null; avatar?: string | null }[];
    }[];
    bench: { id: string; name?: string | null; avatar?: string | null }[];
    managerPickChatId: string | null;
    pendingTrades: {
        id: string;
        proposerId: string;
        receiverId: string;
        offeredPlayerIds: string[];
        requestedPlayerIds: string[];
        status: string;
    }[];
};

export const gamesApi = {
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

    getById: (gameId: string, token?: string) => {
        return apiClient<Game>(`/api/games/${gameId}`, { token });
    },

    create: (data: any, token: string) => {
        return apiClient<{ fieldId: string; id: string }>('/api/games', {
            method: 'POST',
            data,
            token
        });
    },

    update: (gameId: string, data: UpdateGameDTO, token: string) => {
        return apiClient<Game>(`/api/games/${gameId}`, {
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

    getPickSession: (gameId: string, token: string) => {
        return apiClient<PickSessionState>(`/api/games/${gameId}/pick-session`, { token });
    },

    updatePickSchedule: (
        gameId: string,
        data: { pickDrawAt?: string | null; pickingStartsAt?: string | null; pickOrderType?: 'CIRCULAR' | 'SNAKE' },
        token: string
    ) => {
        return apiClient<PickSessionState>(`/api/games/${gameId}/pick-session/schedule`, {
            method: 'PUT',
            data,
            token,
        });
    },

    reorderPickOrder: (gameId: string, order: string[], token: string) => {
        return apiClient<PickSessionState>(`/api/games/${gameId}/pick-session/order`, {
            method: 'PUT',
            data: { order },
            token,
        });
    },

    makePick: (
        gameId: string,
        data: { playerId: string; onBehalfOfManagerId?: string },
        token: string
    ) => {
        return apiClient<PickSessionState>(`/api/games/${gameId}/pick-session/pick`, {
            method: 'POST',
            data,
            token,
        });
    },

    proposeTrade: (
        gameId: string,
        data: { receiverId: string; offeredPlayerIds: string[]; requestedPlayerIds: string[] },
        token: string
    ) => {
        return apiClient<{ trade: unknown; state: PickSessionState }>(
            `/api/games/${gameId}/pick-session/trades`,
            {
                method: 'POST',
                data,
                token,
            }
        );
    },

    resolveTrade: (gameId: string, tradeId: string, approve: boolean, token: string) => {
        return apiClient<PickSessionState>(`/api/games/${gameId}/pick-session/trades/${tradeId}/resolve`, {
            method: 'POST',
            data: { approve },
            token,
        });
    },

    assignRole: (gameId: string, data: { userId: string; role: string }, token: string) => {
        return apiClient<{ organizerId: string; managers: { id: string; name: string | null; avatar: string | null; role: string }[] }>(`/api/games/${gameId}/roles`, {
            method: 'POST',
            data,
            token,
        });
    },

    removeRole: (gameId: string, userId: string, token: string) => {
        return apiClient<{ organizerId: string; managers: { id: string; name: string | null; avatar: string | null; role: string }[] }>(`/api/games/${gameId}/roles/${userId}`, {
            method: 'DELETE',
            token,
        });
    }
};
