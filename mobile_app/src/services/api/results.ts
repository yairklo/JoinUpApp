import { apiClient } from './client';
import type {
    AdminUserReport,
    GameResultView,
    SaveGameResultInput,
    SaveGameResultResponse,
    SubmitUserReportInput,
    UserReportStatus,
    UserStatsResponse,
} from '@/types/results';

export const resultsApi = {
    getGameResult: (gameId: string, token: string | undefined, signal?: AbortSignal) =>
        apiClient<GameResultView>(`/api/games/${gameId}/result`, { token, signal, cache: 'no-store' }),

    saveGameResult: (gameId: string, data: SaveGameResultInput, token: string) =>
        apiClient<SaveGameResultResponse>(`/api/games/${gameId}/result`, { method: 'PUT', data, token }),

    deleteGameResult: (gameId: string, token: string) =>
        apiClient<{ ok: true }>(`/api/games/${gameId}/result`, { method: 'DELETE', token }),

    /** A confirmed participant contests the recorded result (becomes a RESULT_DISPUTE report). */
    disputeGameResult: (gameId: string, data: { details?: string }, token: string) =>
        apiClient<{ ok: true }>(`/api/games/${gameId}/result/dispute`, { method: 'POST', data, token }),

    /** `token` is optional: signed-out viewers get the privacy-filtered/hidden stub. */
    getUserStats: (userId: string, sport: string | undefined, token: string | undefined, signal?: AbortSignal) =>
        apiClient<UserStatsResponse>(
            `/api/users/${userId}/stats${sport ? `?sport=${encodeURIComponent(sport)}` : ''}`,
            { token, signal, cache: 'no-store' }
        ),

    /** Always `{ ok: true }` for a valid request (blocked pairs and duplicates look identical). */
    submitUserReport: (data: SubmitUserReportInput, token: string) =>
        apiClient<{ ok: true }>('/api/user-reports', { method: 'POST', data, token }),

    adminListUserReports: (status: UserReportStatus, token: string, signal?: AbortSignal) =>
        apiClient<AdminUserReport[]>(`/api/admin/user-reports?status=${status}`, { token, signal, cache: 'no-store' }),

    adminResolveUserReport: (
        id: string,
        data: { resolution: string; action?: 'NONE' | 'BAN' },
        token: string
    ) => apiClient<{ ok: true; action: 'NONE' | 'BAN' }>(`/api/admin/user-reports/${id}/resolve`, { method: 'POST', data, token }),

    adminDismissUserReport: (id: string, token: string) =>
        apiClient<{ ok: true }>(`/api/admin/user-reports/${id}/dismiss`, { method: 'POST', token }),
};
