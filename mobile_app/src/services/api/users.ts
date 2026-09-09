import { apiClient } from './client';
import type { Field, FieldFlagReason } from './fields';

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
    gender?: 'MALE' | 'FEMALE' | null;
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

export interface CurrentUser {
    id: string;
    name: string | null;
    imageUrl: string | null;
    email: string | null;
    city: string | null;
    isAdmin: boolean;
}

export interface AdminFieldUser {
    id: string;
    name?: string | null;
    imageUrl?: string | null;
    blockedFromFieldSocial: boolean;
}

export interface AdminFieldComment {
    id: string;
    fieldId: string;
    fieldName: string;
    parentId?: string | null;
    text: string;
    createdAt: string;
    user: AdminFieldUser;
}

export interface AdminFieldIssue {
    id: string;
    fieldId: string;
    fieldName: string;
    parentId?: string | null;
    category: string | null;
    description?: string | null;
    status: 'OPEN' | 'RESOLVED';
    createdAt: string;
    user: AdminFieldUser;
}

export interface AdminFieldCommentFlag {
    id: string;
    reason: FieldFlagReason;
    details?: string | null;
    createdAt: string;
    reporter: { id: string; name?: string | null };
    comment: { id: string; fieldId: string; fieldName: string; text: string; user: AdminFieldUser };
}

export interface AdminFieldIssueFlag {
    id: string;
    reason: FieldFlagReason;
    details?: string | null;
    createdAt: string;
    reporter: { id: string; name?: string | null };
    issue: { id: string; fieldId: string; fieldName: string; category: string | null; description?: string | null; user: AdminFieldUser };
}

export const usersApi = {
    getProfile: (userId: string, token: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, { token });
    },

    getMe: (token: string) => {
        return apiClient<CurrentUser>('/api/users/me', { token, cache: 'no-store' });
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

    cancelFriendRequest: (requestId: string, token: string) => {
        return apiClient(`/api/users/requests/${requestId}/cancel`, {
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

    getFavorites: (userId: string, token: string) => {
        return apiClient<Field[]>(`/api/users/${userId}/favorites`, { token, cache: 'no-store' });
    },

    addFavorite: (userId: string, fieldId: string, token: string) => {
        return apiClient(`/api/users/${userId}/favorites/${fieldId}`, { method: 'POST', token });
    },

    removeFavorite: (userId: string, fieldId: string, token: string) => {
        return apiClient(`/api/users/${userId}/favorites/${fieldId}`, { method: 'DELETE', token });
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
    },

    // --- Admin-only field-content moderation (mirrors next_app's usersApi) ---

    blockUserFromFieldSocial: (userId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/admin/users/${userId}/block-field-social`, { method: 'POST', token });
    },

    unblockUserFromFieldSocial: (userId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/admin/users/${userId}/unblock-field-social`, { method: 'POST', token });
    },

    listFieldComments: (token: string) => {
        return apiClient<AdminFieldComment[]>('/api/admin/field-comments', { token, cache: 'no-store' });
    },

    listFieldIssues: (token: string) => {
        return apiClient<AdminFieldIssue[]>('/api/admin/field-issues', { token, cache: 'no-store' });
    },

    listFieldCommentFlags: (token: string) => {
        return apiClient<AdminFieldCommentFlag[]>('/api/admin/field-comment-flags', { token, cache: 'no-store' });
    },

    dismissFieldCommentFlag: (flagId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/admin/field-comment-flags/${flagId}/dismiss`, { method: 'POST', token });
    },

    listFieldIssueFlags: (token: string) => {
        return apiClient<AdminFieldIssueFlag[]>('/api/admin/field-issue-flags', { token, cache: 'no-store' });
    },

    dismissFieldIssueFlag: (flagId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/admin/field-issue-flags/${flagId}/dismiss`, { method: 'POST', token });
    },
};
