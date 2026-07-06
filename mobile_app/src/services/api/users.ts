import { apiClient } from './client';

export interface UserProfile {
    id: string;
    name: string;
    imageUrl?: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    birthYear?: number | null;
    age?: number | null;
    birthDate?: string | null;
    sports?: { id: string; name: string; position?: string | null }[];
    positions?: { id: string; name: string; sportId: string }[];
}

export const usersApi = {
    getProfile: (userId: string, token: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, { token });
    },

    updateProfile: (userId: string, data: any, token: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, {
            method: 'PUT',
            data,
            token
        });
    },

    getFriends: (userId: string, token: string) => {
        return apiClient<any[]>(`/api/users/${userId}/friends`, { token });
    },

    getOutgoingRequests: (userId: string, token: string) => {
        return apiClient<any[]>(`/api/users/${userId}/requests/outgoing`, { token });
    },

    getIncomingRequests: (userId: string, token: string) => {
        return apiClient<any[]>(`/api/users/${userId}/requests/incoming`, { token });
    },

    acceptFriendRequest: (requestId: string, token: string) => {
        return apiClient(`/api/users/requests/${requestId}/accept`, {
            method: 'POST',
            token
        });
    },

    declineFriendRequest: (requestId: string, token: string) => {
        return apiClient(`/api/users/requests/${requestId}/decline`, {
            method: 'POST',
            token
        });
    },

    sendFriendRequest: (receiverId: string, token: string) => {
        return apiClient('/api/users/requests', {
            method: 'POST',
            data: { receiverId },
            token
        });
    },

    removeFriend: (userId: string, targetUserId: string, token: string) => {
        return apiClient(`/api/users/${userId}/friends/${targetUserId}`, {
            method: 'DELETE',
            token
        });
    },

    search: (query: string, token: string) => {
        return apiClient<any[]>(`/api/users/search?q=${encodeURIComponent(query)}`, { token });
    }
};
