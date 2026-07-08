import { apiClient } from './client';

export interface UserProfile {
    id: string;
    name: string;
    imageUrl?: string;
    // Add other fields
}

export interface NotificationCounters {
    friendRequests: number;
    unreadMessages: number;
}

export const usersApi = {
    getProfile: (userId: string, token?: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, { token });
    },

    getNotificationCounters: (token: string) => {
        return apiClient<NotificationCounters>('/api/users/notifications/counts', { token });
    },

    getFriends: (userId: string, token: string) => {
        return apiClient<any[]>(`/api/users/${userId}/friends`, { token });
    },

    getOutgoingRequests: (userId: string, token: string) => {
        return apiClient<any[]>(`/api/users/${userId}/requests/outgoing`, { token });
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
