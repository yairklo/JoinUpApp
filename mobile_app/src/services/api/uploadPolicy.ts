/** Pure upload policy (only pure imports) so `node --test` can load it directly. */

import { parseRetryAfterMs } from './retryAfter.ts';

/** One 429 retry only; keep the wait short so the user is not left staring at a spinner. */
export const UPLOAD_RETRY_CAP_MS = 10_000;
export const UPLOAD_RETRY_FALLBACK_MS = 2_000;

/** Wait before the single 429 retry: Retry-After (seconds or HTTP date) capped to 10s, fallback 2s, `0` retries now. */
export function uploadRetryDelayMs(header: string | null | undefined, now = Date.now()): number {
    return parseRetryAfterMs(header, { fallbackMs: UPLOAD_RETRY_FALLBACK_MS, maxMs: UPLOAD_RETRY_CAP_MS, now });
}

/** Only HTTP 429 is retried, and only on the first attempt. */
export function shouldRetryUpload(status: number, attempt: number): boolean {
    return status === 429 && attempt === 0;
}
