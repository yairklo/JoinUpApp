import { formatJerusalemDate, formatJerusalemTime } from '@/utils/timezone';

// API base URL — set via EXPO_PUBLIC_API_URL in .env / eas.json
// Optional override for Socket.IO: EXPO_PUBLIC_SOCKET_URL (defaults to API URL)
export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3005';
export const SOCKET_BASE = process.env.EXPO_PUBLIC_SOCKET_URL || API_BASE;

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
    silent?: boolean;
    signal?: AbortSignal;
}

export async function apiClient<T>(endpoint: string, { token, data, signal, silent, ...customConfig }: RequestConfig = {}): Promise<T> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...customConfig.headers,
    };

    const config: RequestInit = {
        method: data ? 'POST' : 'GET',
        body: data ? JSON.stringify(data) : undefined,
        headers,
        signal,
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
            if (!silent) {
                console.error("API Error Details:", errorBody);
            }
            const err = new Error(errorBody.error || `API Error: ${response.statusText}`) as Error & { status?: number };
            err.status = response.status;
            throw err;
        }

        // Return empty object for 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        const result = await response.json();
        return mapGameTimezones(result) as T;
    } catch (error: any) {
        if (!silent) {
            console.error(`API Call Failed [${url}]:`, error);
        }
        throw error;
    }
}
