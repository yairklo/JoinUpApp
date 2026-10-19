import { apiClient } from './client';
import type { ManageOverview } from '@joinup/shared/manage';

export type {
    ManageRole,
    ManagedGame,
    ManagedGroup,
    ManageAttentionItem,
    ManageOverview,
    ManageItem,
} from '@joinup/shared/manage';

export const manageApi = {
    overview: (token: string, signal?: AbortSignal) =>
        apiClient<ManageOverview>('/api/manage/overview', { token, signal }),
};
