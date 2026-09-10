import { apiClient } from './client';

export type SupportMessageType = 'BUG' | 'FEEDBACK';
export type SupportMessageStatus = 'OPEN' | 'RESOLVED';

export interface SupportMessage {
    id: string;
    userId: string;
    type: SupportMessageType;
    message: string;
    context?: string | null;
    status: SupportMessageStatus;
    createdAt: string;
    resolvedAt?: string | null;
    user: { id: string; name?: string | null; imageUrl?: string | null };
}

export const supportApi = {
    submit: (data: { type: SupportMessageType; message: string; context?: string }, token: string) => {
        return apiClient<{ id: string }>('/api/support', { method: 'POST', data, token });
    },

    adminList: (token: string) => {
        return apiClient<SupportMessage[]>('/api/admin/support-messages', { token, cache: 'no-store' });
    },

    adminResolve: (id: string, token: string) => {
        return apiClient<SupportMessage>(`/api/admin/support-messages/${id}/resolve`, { method: 'POST', token });
    },
};
