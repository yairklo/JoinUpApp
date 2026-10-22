/** Pure helpers (no imports) so `node --test` can load them directly. */

/** Fallback wait when a 429 carries no usable Retry-After. */
export const RATE_LIMIT_FALLBACK_MS = 30_000;
/** Upper bound so a bogus header cannot disable a retry button for ages. */
export const RATE_LIMIT_MAX_MS = 5 * 60_000;

/** `Retry-After` is delta-seconds or an HTTP date. Missing/unparseable/non-positive means `fallbackMs`. Result is capped at `maxMs`. */
export function parseRetryAfterMs(
    header: string | null | undefined,
    fallbackMs = RATE_LIMIT_FALLBACK_MS,
    maxMs = RATE_LIMIT_MAX_MS,
    now = Date.now()
): number {
    if (!header) return fallbackMs;
    const trimmed = header.trim();
    let ms: number;
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) ms = Number(trimmed) * 1000;
    else {
        const at = Date.parse(trimmed);
        if (!Number.isFinite(at)) return fallbackMs;
        ms = at - now;
    }
    if (!(ms > 0)) return fallbackMs;
    return Math.min(ms, maxMs);
}

type MaybeApiError = { status?: number; retryAfterMs?: number } | null | undefined;

export type ApiErrorKind = 'rateLimited' | 'network';

export const isRateLimited = (err: MaybeApiError) => err?.status === 429;

/** `rateLimited` for HTTP 429, everything else (offline, timeout, 5xx...) keeps the generic connection message. */
export function classifyApiError(err: MaybeApiError): ApiErrorKind {
    return isRateLimited(err) ? 'rateLimited' : 'network';
}

/** Cooldown before the retry affordance re-enables; 0 for non-429 errors. */
export function rateLimitCooldownMs(err: MaybeApiError): number {
    if (!isRateLimited(err)) return 0;
    const ms = err?.retryAfterMs;
    return typeof ms === 'number' && ms > 0 ? Math.min(ms, RATE_LIMIT_MAX_MS) : RATE_LIMIT_FALLBACK_MS;
}
