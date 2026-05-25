import { apiClient } from './client';

export interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
    data?: {
        link?: string;
        [key: string]: any;
    };
}

export interface NotificationsResponse {
    notifications: Notification[];
    unreadCount: number;
}

export const notificationsApi = {
    getAll: (token: string) => {
        return apiClient<NotificationsResponse>('/api/notifications', { token });
    },

    markAsRead: (id: string, token: string) => {
        return apiClient(`/api/notifications/${id}/read`, {
            method: 'POST',
            token
        });
    },

    markAllAsRead: (token: string) => {
        return apiClient('/api/notifications/read-all', {
            method: 'POST',
            token
        });
    }
};
