/** Cap so a 60s rate-limit window cannot freeze the UI. One retry, then the caller surfaces the error. */
export const READ_BACKOFF_CAP_MS = 5_000;
const READ_BACKOFF_FLOOR_MS = 250;

function clamp(ms: number): number {
    return Math.min(Math.max(ms, READ_BACKOFF_FLOOR_MS), READ_BACKOFF_CAP_MS);
}

/** `Retry-After` is delta-seconds or an HTTP date. Missing or unparseable means 1s. */
export function retryAfterMs(header: string | null | undefined, now = Date.now()): number {
    if (!header) return 1000;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return clamp(seconds * 1000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return clamp(at - now);
    return 1000;
}

function abortError(): Error {
    const e = new Error('The operation was aborted.');
    e.name = 'AbortError';
    return e;
}

/** Resolves after `ms`, or rejects immediately if `signal` aborts so the retry is never sent. */
export function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort);
    });
}

/**
 * GET/HEAD only: on 429, wait `Retry-After` (capped) and try once more.
 * Mutations are returned as-is so a 429 is not replayed. An aborted signal
 * cancels the wait and does not send the second request.
 */
export async function fetchRead(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const first = await fetch(input, init);
    if (first.status !== 429 || (method !== 'GET' && method !== 'HEAD')) return first;
    await delay(retryAfterMs(first.headers.get('Retry-After')), init.signal);
    return fetch(input, init);
}
