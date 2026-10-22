import { formatJerusalemDate, formatJerusalemTime } from '@/utils/timezone';
import { isAbortError } from '@/utils/apiErrors';

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
    /** Abort the request after this many ms (default 20s for GET, 60s for mutations) so dead connections surface as errors. */
    timeoutMs?: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
/** Mutations/uploads can be slow on a cold backend and may already be applied server-side, so allow longer. */
export const MUTATION_REQUEST_TIMEOUT_MS = 60000;

/** Combine a caller's abort signal with a timeout. `cleanup` must be called when the request settles. */
function withRequestTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onAbort);
    }
    return {
        signal: controller.signal,
        didTimeout: () => timedOut,
        cleanup: () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        },
    };
}

export async function apiClient<T>(endpoint: string, { token, data, signal, silent, timeoutMs: timeoutOverride, ...customConfig }: RequestConfig = {}): Promise<T> {
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...customConfig.headers,
    };

    const method = String(customConfig.method || (data ? 'POST' : 'GET')).toUpperCase();
    const timeoutMs = timeoutOverride ?? (method === 'GET' ? DEFAULT_REQUEST_TIMEOUT_MS : MUTATION_REQUEST_TIMEOUT_MS);
    const timeout = withRequestTimeout(signal, timeoutMs);
    const config: RequestInit = {
        method: data ? 'POST' : 'GET',
        body: data ? JSON.stringify(data) : undefined,
        headers,
        ...customConfig,
        signal: timeout.signal,
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
            const err = new Error(errorBody.error || `API Error: ${response.statusText}`) as Error & { status?: number; code?: string; body?: any };
            err.status = response.status;
            if (typeof errorBody.code === 'string') err.code = errorBody.code;
            err.body = errorBody;
            throw err;
        }

        // Return empty object for 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        const result = await response.json();
        return mapGameTimezones(result) as T;
    } catch (rawError: any) {
        let error = rawError;
        if (timeout.didTimeout()) {
            error = new Error('Request timed out') as Error & { code?: string };
            (error as any).code = 'TIMEOUT';
        }
        // Callers routinely abort in-flight requests on unmount/param-change (see
        // useGamesByDate.ts, SeriesSection.tsx) and already treat that as a normal,
        // non-error outcome via isAbortError() — logging it here as a scary
        // "API Call Failed" was pure noise, not a real failure.
        if (!silent && !isAbortError(error)) {
            console.error(`API Call Failed [${url}]:`, error);
        }
        throw error;
    } finally {
        timeout.cleanup();
    }
}

/** RN's fetch/FormData needs { uri, name, type } for a file part, not a web File object. */
export async function uploadMultipart<T>(
    path: string,
    fieldName: string,
    image: { uri: string; name: string; type: string },
    token: string,
    failMessage = 'Failed to upload image'
): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, image as unknown as Blob);
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || failMessage);
    }
    return res.json();
}
