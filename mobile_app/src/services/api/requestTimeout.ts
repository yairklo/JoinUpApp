/** Timeout + upload-retry plumbing (only pure imports) so `node --test` can load it directly. */
import { delay } from './readBackoff.ts';
import { shouldRetryUpload, uploadRetryDelayMs } from './uploadPolicy.ts';

/** Combine a caller's abort signal with a timeout. `cleanup` must be called when the request settles. */
export function withRequestTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
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

/**
 * POST once, and on a first 429 wait Retry-After (capped) and POST exactly once more; a second 429 is returned
 * as-is for the caller to surface. `signal` is the timeout-combined signal, so aborting cancels the wait too.
 * `delayFn` is a test seam.
 */
export async function fetchUploadWithRetry(
    doFetch: (signal: AbortSignal) => Promise<Response>,
    signal: AbortSignal,
    delayFn: (ms: number, signal?: AbortSignal | null) => Promise<void> = delay
): Promise<Response> {
    let res!: Response;
    for (let attempt = 0; attempt < 2; attempt++) {
        res = await doFetch(signal);
        if (!shouldRetryUpload(res.status, attempt)) break;
        await delayFn(uploadRetryDelayMs(res.headers.get('Retry-After')), signal);
    }
    return res;
}
