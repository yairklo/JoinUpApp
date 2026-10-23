/** Pure helpers (only pure imports) so `node --test` can load them directly. */

import { RETRY_AFTER_FALLBACK_MS, RETRY_AFTER_MAX_MS } from '../services/api/retryAfter.ts';

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
    return typeof ms === 'number' && ms >= 0 ? Math.min(ms, RETRY_AFTER_MAX_MS) : RETRY_AFTER_FALLBACK_MS;
}
