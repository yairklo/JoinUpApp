import type { AgeGateInfo } from '@joinup/shared/ageGate';
import { apiClient, API_BASE } from './client';
import type { FieldFlagReason } from './fields';
import type { MatchHistoryResult, StatsSummary } from '@/types/matchResult';

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
    /** Viewer-filtered result badge; absent when hidden or no result. */
    result?: MatchHistoryResult | null;
}

export interface ProfileGroup {
    id: string;
    title?: string | null;
    fieldName: string;
    sport?: string | null;
}

export interface PrivacySettings {
    hideGroups?: boolean;
    hideMatchStats?: boolean;
    privacyFriends: PrivacyLevel | null;
    privacyGames: PrivacyLevel | null;
    privacyMessages: PrivacyLevel | null;
    resolved: {
        privacyFriends: PrivacyLevel;
        privacyGames: PrivacyLevel;
        privacyMessages: PrivacyLevel;
    };
    /** What each field resolves to when unset (age-based). Absent on older servers. */
    ageDefaults?: {
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
    /** Profile hero block; absent when stats are hidden or none recorded. */
    statsSummary?: StatsSummary;
    /** null when the user hides their groups from other viewers. */
    groups?: ProfileGroup[] | null;
    privacySettings?: PrivacySettings;
    ratingAverage?: number | null;
    totalRatings?: number;
    /** True when a non-friend is looking at a minor: age and about-details are omitted. */
    profileRestricted?: boolean;
    canMessage?: boolean;
    /**
     * False when this viewer must not send a friend request: an adult or unknown-age
     * account looking at a minor on the friends-only default. A minor looking at
     * another minor is true, so the add-friend button stays available.
     */
    canAddFriend?: boolean;
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
    ageGate?: AgeGateInfo;
}

export interface AgeGateSubmission {
    birthDate?: string; // YYYY-MM-DD
    acceptTerms: boolean;
    guardianConsent?: boolean;
}

export interface FlaggedMessageUser {
    id: string;
    name: string | null;
    imageUrl?: string | null;
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
    aiTriggers?: {
        source?: string;
        reason?: string;
        details?: string | null;
        reporterId?: string;
        roomId?: string;
        messageDeleted?: boolean;
    } | null;
    /** Live state of the reported message; null for AI rows with no message or if it is gone. */
    messageState?: {
        isEdited: boolean;
        isDeleted: boolean;
        deletedAt?: string | null;
        currentText: string | null;
        /** Text before the first edit, or the text at deletion. */
        originalText: string | null;
        edits: { previousText: string; editedAt: string }[];
    } | null;
    /** Resolved by the admin list endpoint; null if the user no longer exists. */
    sender?: FlaggedMessageUser | null;
    reporter?: FlaggedMessageUser | null;
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

export interface BlockedUser {
    id: string;
    name: string | null;
    imageUrl: string | null;
    blockedAt: string;
}

const meInflight = new Map<string, Promise<CurrentUser>>();

export const usersApi = {
    getProfile: (userId: string, token?: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`, { token });
    },

    getNotificationCounters: (token: string) => {
        return apiClient<NotificationCounters>('/api/users/notifications/counts', { token });
    },

    getBlockedUsers: (token: string) => {
        return apiClient<BlockedUser[]>('/api/users/blocks', { token, cache: 'no-store' });
    },

    blockUser: (userId: string, token: string) => {
        return apiClient(`/api/users/${userId}/block`, { method: 'POST', token });
    },

    unblockUser: (userId: string, token: string) => {
        return apiClient(`/api/users/${userId}/block`, { method: 'DELETE', token });
    },

    deleteAccount: (token: string) => {
        return apiClient<{ ok: boolean }>('/api/users/me', { method: 'DELETE', token });
    },

    getMe: (token: string) => {
        // Navbar, age gate and the avatar store each call this on mount. Share the
        // in-flight request so one page does not spend three reads on the same user.
        const existing = meInflight.get(token);
        if (existing) return existing;
        const request = apiClient<CurrentUser>('/api/users/me', { token, cache: 'no-store' })
            .finally(() => { meInflight.delete(token); });
        meInflight.set(token, request);
        return request;
    },

    submitAgeGate: (body: AgeGateSubmission, token: string) => {
        return apiClient<{ ageGate: AgeGateInfo }>('/api/users/me/age-gate', { method: 'POST', data: body, token });
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

    getIncomingRequests: (userId: string, token: string) => {
        return apiClient<Array<{ id: string; requester: { id: string } }>>(`/api/users/${userId}/requests/incoming`, { token });
    },

    acceptFriendRequest: (requestId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/users/requests/${requestId}/accept`, { method: 'POST', token });
    },

    declineFriendRequest: (requestId: string, token: string) => {
        return apiClient<{ ok: true }>(`/api/users/requests/${requestId}/decline`, { method: 'POST', token });
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
            /** Same rule as PublicUser.canAddFriend. Missing means the button may show. */
            canAddFriend?: boolean;
        }>>(
            `/api/users/search?q=${encodeURIComponent(query)}`,
            { token }
        );
    },

    updatePrivacySettings: (
        data: Partial<Record<'privacyFriends' | 'privacyGames' | 'privacyMessages', PrivacyLevel | null>> & { hideGroups?: boolean; hideMatchStats?: boolean },
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
