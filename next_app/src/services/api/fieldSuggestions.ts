import { apiClient } from './client';
import type { Field, FieldWriteData } from './fields';

export type FieldSuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface FieldSuggestion {
    id: string;
    userId: string;
    name: string;
    address: string;
    /** null = the suggester didn't know */
    isPaid: boolean | null;
    contactInfo?: string | null;
    lat?: number | null;
    lng?: number | null;
    sport?: string | null;
    status: FieldSuggestionStatus;
    createdAt: string;
    user?: { id: string; name?: string | null; imageUrl?: string | null };
}

export interface FieldSuggestionInput {
    name: string;
    address: string;
    isPaid: boolean | null;
    contactInfo?: string;
    lat?: number;
    lng?: number;
    sport?: string;
}

// "הצע מגרש חדש": submitting only queues a request for the admins -- no Field is created
// (and nothing shows up in field search) until an admin approves it.
export const fieldSuggestionsApi = {
    submit: (data: FieldSuggestionInput, token: string) => {
        return apiClient<{ id: string; status: FieldSuggestionStatus }>('/api/field-suggestions', { method: 'POST', data, token });
    },

    adminList: (token: string) => {
        return apiClient<FieldSuggestion[]>('/api/field-suggestions', { token, cache: 'no-store' });
    },

    /** Creates the real (listed) Field from the admin-edited payload and resolves the suggestion. */
    adminApprove: (id: string, data: FieldWriteData & { name: string; location: string; type: 'open' | 'closed' }, token: string) => {
        return apiClient<Field>(`/api/field-suggestions/${id}/approve`, { method: 'POST', data, token });
    },

    adminReject: (id: string, token: string, adminNote?: string) => {
        return apiClient<{ id: string; status: FieldSuggestionStatus }>(`/api/field-suggestions/${id}/reject`, {
            method: 'POST',
            data: adminNote ? { adminNote } : {},
            token,
        });
    },
};
