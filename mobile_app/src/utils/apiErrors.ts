export function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const name = (error as { name?: string }).name;
    return name === 'AbortError';
}

export function isGatewayError(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return status === 502 || status === 503 || status === 504;
}

export function getFriendlyFetchError(error: unknown, fallback = 'שגיאה בטעינת הנתונים'): string {
    if (isAbortError(error)) return '';
    if (isGatewayError(error)) return 'השרת לא זמין כרגע. נסה שוב בעוד רגע.';
    return fallback;
}
