import { apiClient, API_BASE } from './client';

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
    city?: string | null;
    age?: number | null;
    sports?: { id: string; name: string; position?: string | null }[];
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

export interface CurrentUser {
    id: string;
    name: string | null;
    imageUrl?: string | null;
    email?: string | null;
    city?: string | null;
    isAdmin: boolean;
}

export const usersApi = {
    getProfile: (userId: string, token?: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, { token });
    },

    getNotificationCounters: (token: string) => {
        return apiClient<NotificationCounters>('/api/users/notifications/counts', { token });
    },

    getMe: (token: string) => {
        return apiClient<CurrentUser>('/api/users/me', { token, cache: 'no-store' });
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
        return apiClient<{ id: string; name?: string | null; imageUrl?: string | null }[]>(
            `/api/users/search?q=${encodeURIComponent(query)}`,
            { token }
        );
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

    getMatchHistory: (userId: string, skip: number, take: number, token?: string) => {
        return apiClient<ProfileMatch[]>(
            `/api/users/${userId}/match-history?skip=${skip}&take=${take}`,
            { token }
        );
    },

    uploadImage: async (userId: string, file: File, token: string): Promise<{ imageUrl: string }> => {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(`${API_BASE}/api/users/${userId}/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to upload image');
        }
        return res.json();
    },

    removeImage: (userId: string, token: string) => {
        return apiClient<{ imageUrl: null }>(`/api/users/${userId}/image`, {
            method: 'DELETE',
            token,
        });
    },
};
