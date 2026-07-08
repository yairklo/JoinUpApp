import { apiClient } from './client';

export type PrivacyLevel = 'EVERYONE' | 'FRIENDS_ONLY';

export interface SportStat {
    sport: string;
    count: number;
}

export interface ProfileFriend {
    id: string;
    name: string | null;
    imageUrl?: string | null;
}

export interface ProfileMatch {
    id: string;
    title?: string | null;
    sport?: string | null;
    start: string;
    date?: string;
    time?: string;
}

export interface PrivacySettings {
    privacyFriends: PrivacyLevel | null;
    privacyGames: PrivacyLevel | null;
    privacyMessages: PrivacyLevel | null;
    resolved: {
        privacyFriends: PrivacyLevel;
        privacyGames: PrivacyLevel;
        privacyMessages: PrivacyLevel;
    };
}

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
    sections?: { friends: boolean; matchHistory: boolean };
    friends?: ProfileFriend[] | null;
    matchHistory?: ProfileMatch[] | null;
    sportStats?: SportStat[];
    privacySettings?: PrivacySettings;
    ratingAverage?: number | null;
    totalRatings?: number;
}

export interface NotificationCounters {
    friendRequests: number;
    unreadMessages: number;
}

export const usersApi = {
    getProfile: (userId: string, token: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, { token });
    },

    getNotificationCounters: (token: string) => {
        return apiClient<NotificationCounters>('/api/users/notifications/counts', { token });
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
    },

    updatePrivacySettings: (
        data: Partial<Record<'privacyFriends' | 'privacyGames' | 'privacyMessages', PrivacyLevel | null>>,
        token: string
    ) => {
        return apiClient<PrivacySettings>('/api/users/profile/settings', {
            method: 'PUT',
            data,
            token,
        });
    },

    getMatchHistory: (userId: string, skip: number, take: number, token: string) => {
        return apiClient<ProfileMatch[]>(
            `/api/users/${userId}/match-history?skip=${skip}&take=${take}`,
            { token }
        );
    }
};
