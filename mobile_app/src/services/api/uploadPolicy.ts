/** Pure upload policy (no imports) so `node --test` can load it directly. */

export const UPLOAD_TIMEOUT_MS = 30_000;
/** One 429 retry only; keep the wait short so the user is not left staring at a spinner. */
export const UPLOAD_RETRY_CAP_MS = 10_000;
export const UPLOAD_RETRY_FALLBACK_MS = 2_000;

/** Wait before the single 429 retry: Retry-After (seconds or HTTP date) capped to 10s, fallback 2s. */
export function uploadRetryDelayMs(header: string | null | undefined, now = Date.now()): number {
    if (!header || !header.trim()) return UPLOAD_RETRY_FALLBACK_MS;
    const trimmed = header.trim();
    let ms: number;
    if (Number.isFinite(Number(trimmed))) ms = Number(trimmed) * 1000;
    else {
        const at = Date.parse(trimmed);
        if (!Number.isFinite(at)) return UPLOAD_RETRY_FALLBACK_MS;
        ms = at - now;
    }
    if (!(ms > 0)) return UPLOAD_RETRY_FALLBACK_MS;
    return Math.min(ms, UPLOAD_RETRY_CAP_MS);
}

/** Only HTTP 429 is retried, and only on the first attempt. */
export function shouldRetryUpload(status: number, attempt: number): boolean {
    return status === 429 && attempt === 0;
}
