import { apiClient } from './client';

export interface UserProfile {
    id: string;
    name: string;
    imageUrl?: string;
    // Add other fields
}

export const usersApi = {
    getProfile: (userId: string) => {
        return apiClient<UserProfile>(`/api/users/${userId}`);
    }
};
