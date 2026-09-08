import { apiClient, API_BASE } from './client';
import type { FieldFlagReason } from './fields';

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

export interface FlaggedMessage {
    id: string;
    messageId?: string | null;
    content: string;
    userId: string;
    status: string;
    resolution?: string | null;
    retryCount: number;
    failureReason?: string | null;
    createdAt: string;
}

export interface AdminFieldComment {
    id: string;
    fieldId: string;
    fieldName: string;
    parentId?: string | null;
    text: string;
    createdAt: string;
    user: { id: string; name?: string | null; imageUrl?: string | null; blockedFromFieldSocial: boolean };
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
    user: { id: string; name?: string | null; imageUrl?: string | null; blockedFromFieldSocial: boolean };
}

export interface AdminFieldCommentFlag {
    id: string;
    reason: FieldFlagReason;
    details?: string | null;
    createdAt: string;
    reporter: { id: string; name?: string | null };
    comment: {
        id: string;
        fieldId: string;
        fieldName: string;
        text: string;
        user: { id: string; name?: string | null; imageUrl?: string | null; blockedFromFieldSocial: boolean };
    };
}

export interface AdminFieldIssueFlag {
    id: string;
    reason: FieldFlagReason;
    details?: string | null;
    createdAt: string;
    reporter: { id: string; name?: string | null };
    issue: {
        id: string;
        fieldId: string;
        fieldName: string;
        category: string | null;
        description?: string | null;
        user: { id: string; name?: string | null; imageUrl?: string | null; blockedFromFieldSocial: boolean };
    };
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

    listFlaggedMessages: (token: string) => {
        return apiClient<FlaggedMessage[]>('/api/admin/flagged-messages', { token, cache: 'no-store' });
    },

    dismissFlaggedMessage: (id: string, token: string) => {
        return apiClient<FlaggedMessage>(`/api/admin/flagged-messages/${id}/dismiss`, { method: 'POST', token });
    },

    removeFlaggedMessage: (id: string, token: string) => {
        return apiClient<FlaggedMessage>(`/api/admin/flagged-messages/${id}/remove-message`, { method: 'POST', token });
    },

    banUser: (userId: string, token: string, reason?: string) => {
        return apiClient<{ ok: true }>(`/api/admin/users/${userId}/ban`, { method: 'POST', data: { reason }, token });
    },

    unbanUser: (userId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/admin/users/${userId}/unban`, { method: 'POST', token });
    },

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
        return apiClient<Array<{
            id: string;
            name?: string | null;
            email?: string | null;
            imageUrl?: string | null;
            city?: string | null;
            friendshipStatus?: 'none' | 'friends' | 'pending';
            requestId?: string | null;
            isRequestSender?: boolean;
        }>>(
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
