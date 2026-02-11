import { apiClient } from './client';

export interface ChatDetails {
    id: string;
    type: string;
    participants: any[];
    // Add other fields as needed
}

export const chatsApi = {
    getDetails: (roomId: string, token: string) => {
        return apiClient<ChatDetails>(`/api/chats/${roomId}`, { token });
    }
};
