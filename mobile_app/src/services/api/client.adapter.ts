import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'clerk-db-jwt';

export const tokenStorage = {
    getToken: async (key: string): Promise<string | null> => {
        try {
            return await SecureStore.getItemAsync(key);
        } catch (e) {
            return null;
        }
    },
    saveToken: async (key: string, value: string): Promise<void> => {
        try {
            await SecureStore.setItemAsync(key, value);
        } catch (e) {
            console.error('Error saving token', e);
        }
    },
    clearToken: async (key: string): Promise<void> => {
        try {
            await SecureStore.deleteItemAsync(key);
        } catch (e) {
            console.error('Error deleting token', e);
        }
    }
};

export async function getAuthToken(): Promise<string | null> {
    return await tokenStorage.getToken(TOKEN_KEY);
}
