import { formatJerusalemDate, formatJerusalemTime } from '@/utils/timezone';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

function mapGameTimezones(data: any): any {
    if (!data) return data;
    if (Array.isArray(data)) {
        return data.map(mapGameTimezones);
    }
    if (typeof data === 'object') {
        if (data.start && (data.date === undefined || data.time === undefined || data.date === "" || data.time === "")) {
            data.date = formatJerusalemDate(data.start);
            data.time = formatJerusalemTime(data.start);
        }
        for (const key in data) {
            if (data[key] && typeof data[key] === 'object') {
                data[key] = mapGameTimezones(data[key]);
            }
        }
    }
    return data;
}

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

        const result = await response.json();
        return mapGameTimezones(result) as T;
    } catch (error) {
        console.error(`API Call Failed [${url}]:`, error);
        throw error;
    }
}
