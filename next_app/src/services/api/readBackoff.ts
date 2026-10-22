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

function abortError(signal: AbortSignal): DOMException {
    return signal.reason instanceof DOMException ? signal.reason : new DOMException('The operation was aborted.', 'AbortError');
}

/** Resolves after `ms`, or rejects immediately if `signal` aborts so the retry is never sent. */
function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError(signal as AbortSignal));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * GET/HEAD only: on 429, wait `Retry-After` (capped) and try once more.
 * Mutations are returned as-is so a 429 is not replayed. An aborted signal
 * cancels the wait and does not send the second request.
 */
export async function fetchRead(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const first = await fetch(input, init);
    if (first.status !== 429 || (method !== 'GET' && method !== 'HEAD')) return first;
    await delay(retryAfterMs(first.headers.get('Retry-After')), init?.signal);
    return fetch(input, init);
}
