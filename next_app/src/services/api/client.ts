export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

interface RequestConfig extends RequestInit {
    token?: string;
    data?: any;
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
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody.error || `API Error: ${response.statusText}`);
        }

        // Return empty object for 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    } catch (error) {
        console.error(`API Call Failed [${url}]:`, error);
        throw error;
    }
}
