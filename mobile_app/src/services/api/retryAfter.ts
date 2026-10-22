/** Pure helper (no imports) so `node --test` can load it directly. Single `Retry-After` parser for the app. */

/** Wait used when a 429 carries no usable Retry-After. */
export const RETRY_AFTER_FALLBACK_MS = 30_000;
/** Upper bound so a bogus header cannot block a retry for ages. */
export const RETRY_AFTER_MAX_MS = 5 * 60_000;

/**
 * `Retry-After` is delta-seconds or an HTTP date.
 * - missing / empty / NaN / negative seconds / unparseable -> `fallbackMs`
 * - explicit `0` or a date in the past -> 0 (retry now), never the fallback
 * - anything larger than `maxMs` -> `maxMs`
 */
export function parseRetryAfterMs(
    header: string | null | undefined,
    { fallbackMs = RETRY_AFTER_FALLBACK_MS, maxMs = RETRY_AFTER_MAX_MS, now = Date.now() }: { fallbackMs?: number; maxMs?: number; now?: number } = {}
): number {
    const trimmed = header?.trim();
    if (!trimmed) return fallbackMs;
    let ms: number;
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds)) {
        if (seconds < 0) return fallbackMs;
        ms = seconds * 1000;
    } else {
        const at = Date.parse(trimmed);
        if (!Number.isFinite(at)) return fallbackMs;
        ms = Math.max(0, at - now);
    }
    return Math.min(ms, maxMs);
}
