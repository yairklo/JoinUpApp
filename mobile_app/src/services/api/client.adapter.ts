import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'clerk-db-jwt';
const memoryStorage = new Map<string, string>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
    });
    return Promise.race([
        promise.then((res) => {
            clearTimeout(timeoutId);
            return res;
        }),
        timeoutPromise
    ]);
}

export const tokenStorage = {
    getToken: async (key: string): Promise<string | null> => {
        try {
            const val = await withTimeout(SecureStore.getItemAsync(key), 1000, "__TIMEOUT__");
            if (val === "__TIMEOUT__") {
                console.warn("SecureStore.getItemAsync timed out for key:", key);
                return memoryStorage.get(key) || null;
            }
            return val;
        } catch (e) {
            console.error("SecureStore.getItemAsync error:", e);
            return memoryStorage.get(key) || null;
        }
    },
    saveToken: async (key: string, value: string): Promise<void> => {
        memoryStorage.set(key, value);
        try {
            await withTimeout(SecureStore.setItemAsync(key, value), 1000, null);
        } catch (e) {
            console.error('Error saving token', e);
        }
    },
    clearToken: async (key: string): Promise<void> => {
        memoryStorage.delete(key);
        try {
            await withTimeout(SecureStore.deleteItemAsync(key), 1000, null);
        } catch (e) {
            console.error('Error deleting token', e);
        }
    }
};

export async function getAuthToken(): Promise<string | null> {
    return await tokenStorage.getToken(TOKEN_KEY);
}
