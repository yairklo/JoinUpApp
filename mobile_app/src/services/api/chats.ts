import { apiClient } from './client';

export interface ChatDetails {
    id: string;
    type: string;
    participants: any[];
    // Add other fields as needed
}

export const chatsApi = {
    getDetails: (chatId: string, token: string) => {
        return apiClient<ChatDetails>(`/api/chats/${chatId}/details`, { token });
    },

    getUserChats: (userId: string, token: string) => {
        return apiClient<any[]>(`/api/users/${userId}/chats`, { token });
    },

    createPrivate: (targetUserId: string, token: string) => {
        return apiClient<{ chatId: string }>('/api/chats/private', {
            method: 'POST',
            data: { targetUserId },
            token
        });
    }
};
