import { apiClient } from './client';
import type {
    NotificationSettings,
    NotificationSettingsUpdate,
    NotificationMute,
    NotificationMuteTarget,
} from '@joinup/shared/notificationPrefs';

export type { NotificationSettings, NotificationSettingsUpdate, NotificationMute, NotificationMuteTarget };

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
    getSettings: (token: string) => {
        return apiClient<NotificationSettings>('/api/notifications/settings', { token });
    },

    /** Partial update — send only the keys that changed. */
    updateSettings: (settings: NotificationSettingsUpdate, token: string) => {
        return apiClient<NotificationSettings>('/api/notifications/settings', {
            method: 'PUT',
            data: settings,
            token,
        });
    },

    /** hours: 1|2|4|8|24 pauses push; null resumes. */
    snooze: (hours: number | null, token: string) => {
        return apiClient<NotificationSettings>('/api/notifications/settings/snooze', {
            method: 'POST',
            data: { hours },
            token,
        });
    },

    getMutes: (token: string) => {
        return apiClient<NotificationMute[]>('/api/notifications/mutes', { token });
    },

    /** durationHours null/undefined = until unmuted */
    mute: (targetType: NotificationMuteTarget, targetId: string, durationHours: number | null | undefined, token: string) => {
        return apiClient<NotificationMute[]>('/api/notifications/mutes', {
            method: 'POST',
            data: { targetType, targetId, durationHours: durationHours ?? null },
            token,
        });
    },

    unmute: (targetType: NotificationMuteTarget, targetId: string, token: string) => {
        return apiClient<NotificationMute[]>(
            `/api/notifications/mutes/${targetType}/${encodeURIComponent(targetId)}`,
            { method: 'DELETE', token }
        );
    },

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
    },

    registerDevice: (expoPushToken: string, deviceType: string, token: string, locale?: 'en' | 'he') => {
        return apiClient('/api/notifications/register-device', {
            data: { expoPushToken, deviceType, ...(locale ? { locale } : {}) },
            token
        });
    }
};
