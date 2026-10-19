import i18n from '@/i18n';

export function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const name = (error as { name?: string }).name;
    return name === 'AbortError';
}

export function isGatewayError(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return status === 502 || status === 503 || status === 504;
}

export function getFriendlyFetchError(error: unknown, fallback?: string): string {
    if (isAbortError(error)) return '';
    if (isGatewayError(error)) return i18n.t('errors.gatewayError', 'השרת לא זמין כרגע. נסה שוב בעוד רגע.');
    return fallback ?? i18n.t('errors.fetchFailed', 'שגיאה בטעינת הנתונים');
}

/**
 * Clerk's getToken() can resolve null or hang while offline; saves must surface that as an
 * error (so the user sees feedback and keeps their data) instead of silently doing nothing.
 */
export async function getTokenOrThrow(getToken: () => Promise<string | null>, timeoutMs = 10000): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const token = await Promise.race([
            getToken(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Auth token timed out')), timeoutMs);
            }),
        ]);
        if (!token) throw new Error('No auth token');
        return token;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
