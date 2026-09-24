import { apiClient } from './client';

export interface ChatDetails {
    id: string;
    type: string;
    participants: any[];
    // Add other fields as needed
}

export type MessageReportReason = 'OFFENSIVE' | 'HARASSMENT' | 'SPAM' | 'INAPPROPRIATE' | 'OTHER';

export const chatsApi = {
    getDetails: (chatId: string, token: string) => {
        return apiClient<ChatDetails>(`/api/chats/${chatId}`, { token });
    },

    createPrivate: (targetUserId: string, token: string) => {
        return apiClient<{ chatId: string }>('/api/chats/private', {
            method: 'POST',
            data: { targetUserId },
            token
        });
    },

    reportMessage: (messageId: string, reason: MessageReportReason, token: string, details?: string) => {
        return apiClient<{ ok: boolean; alreadyReported?: boolean }>(`/api/messages/${messageId}/report`, {
            method: 'POST',
            data: { reason, details },
            token
        });
    }
};
