const PROD_API = "https://joinup-app.onrender.com"; // Hardcoded for now or use Env
const DEV_API = "http://10.0.2.2:3005"; // Android Emulator

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3005";

interface RequestConfig extends RequestInit {
    token?: string;
    data?: any;
    silent?: boolean;
}

export async function apiClient<T>(endpoint: string, { token, data, ...customConfig }: RequestConfig = {}): Promise<T> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...customConfig.headers,
    };

    const config: RequestInit = {
        method: data ? 'POST' : 'GET',
        body: data ? JSON.stringify(data) : undefined,
        headers,
        ...customConfig,
    };

    // Handle absolute URL requirement for React Native
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            const errorText = await response.text();
            let errorBody;
            try {
                errorBody = JSON.parse(errorText);
            } catch {
                errorBody = { error: `API Error: ${response.status} ${response.statusText}`, details: errorText };
            }
            if (!customConfig.silent) {
                console.error("API Error Details:", errorBody);
            }
            throw new Error(errorBody.error || `API Error: ${response.statusText}`);
        }

        // Return empty object for 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    } catch (error: any) {
        if (!customConfig.silent) {
            console.error(`API Call Failed [${url}]:`, error);
        }
        throw error;
    }
}
