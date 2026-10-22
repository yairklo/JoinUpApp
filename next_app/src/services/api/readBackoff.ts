/** Cap so a 60s rate-limit window cannot freeze the UI. One retry, then the caller surfaces the error. */
export const READ_BACKOFF_CAP_MS = 5_000;
const READ_BACKOFF_FLOOR_MS = 250;

/** `Retry-After` is delta-seconds or an HTTP date. Missing or unparseable means 1s. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
    if (!header) return 1000;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return clamp(seconds * 1000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return clamp(at - now);
    return 1000;
}

function clamp(ms: number): number {
    return Math.min(Math.max(ms, READ_BACKOFF_FLOOR_MS), READ_BACKOFF_CAP_MS);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET/HEAD only: on 429, wait `Retry-After` (capped) and try once more.
 * Mutations are returned as-is so a 429 is not replayed.
 */
export async function fetchRead(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const first = await fetch(input, init);
    if (first.status !== 429 || (method !== 'GET' && method !== 'HEAD')) return first;
    await delay(retryAfterMs(first.headers.get('Retry-After')));
    return fetch(input, init);
}
