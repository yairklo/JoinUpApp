import { apiClient } from './client';
import type {
    AdminUserReport,
    GameResultView,
    SaveGameResultInput,
    SaveGameResultResponse,
    SubmitUserReportInput,
    UserReportResolveAction,
    UserReportStatus,
    UserStatsResponse,
} from '@/types/matchResult';
import type { PrivacySettings } from './users';

/** Match result for a game (viewer-filtered; auth required). */
export const resultsApi = {
    get: (gameId: string, token: string) =>
        apiClient<GameResultView>(`/api/games/${gameId}/result`, { token, cache: 'no-store' }),

    /** Create or replace the result (managers/admin). Throws with err.code e.g. RESULT_LOCKED. */
    save: (gameId: string, data: SaveGameResultInput, token: string) =>
        apiClient<SaveGameResultResponse>(`/api/games/${gameId}/result`, { method: 'PUT', data, token }),

    remove: (gameId: string, token: string) =>
        apiClient<{ ok: true }>(`/api/games/${gameId}/result`, { method: 'DELETE', token }),

    /** Confirmed participant disputes the recorded result; becomes a RESULT_DISPUTE report. */
    dispute: (gameId: string, data: { details?: string }, token: string) =>
        apiClient<{ ok: true }>(`/api/games/${gameId}/result/dispute`, { method: 'POST', data, token }),
};

export const userStatsApi = {
    /** Visibility-aware: a hidden profile resolves to { visible:false, hiddenReason, sports: [] }. Token optional. */
    get: (userId: string, opts: { sport?: string; token?: string } = {}) => {
        const qs = opts.sport ? `?sport=${encodeURIComponent(opts.sport)}` : '';
        return apiClient<UserStatsResponse>(`/api/users/${userId}/stats${qs}`, {
            token: opts.token,
            cache: 'no-store',
        });
    },

    /** Owner-only toggle; returns the refreshed privacy settings. */
    setHideMatchStats: (hideMatchStats: boolean, token: string) =>
        apiClient<PrivacySettings>('/api/users/profile/settings', {
            method: 'PUT',
            data: { hideMatchStats },
            token,
        }),
};

export const userReportsApi = {
    submit: (data: SubmitUserReportInput, token: string) =>
        apiClient<{ ok: true }>('/api/user-reports', { method: 'POST', data, token }),
};

export const adminUserReportsApi = {
    list: (status: UserReportStatus, token: string) =>
        apiClient<AdminUserReport[]>(`/api/admin/user-reports?status=${status}`, { token, cache: 'no-store' }),

    resolve: (id: string, data: { resolution: string; action?: UserReportResolveAction }, token: string) =>
        apiClient<{ ok: true; action: UserReportResolveAction }>(`/api/admin/user-reports/${id}/resolve`, {
            method: 'POST',
            data,
            token,
        }),

    dismiss: (id: string, token: string) =>
        apiClient<{ ok: true }>(`/api/admin/user-reports/${id}/dismiss`, { method: 'POST', token }),
};
