import { fetchRead, retryAfterMs } from './readBackoff';

describe('retryAfterMs', () => {
    test('delta seconds', () => {
        expect(retryAfterMs('2')).toBe(2000);
    });

    test('caps a full window at 5s', () => {
        expect(retryAfterMs('60')).toBe(5000);
    });

    test('floors a zero delay', () => {
        expect(retryAfterMs('0')).toBe(250);
    });

    test('reads an HTTP date', () => {
        const now = Date.parse('2026-10-22T12:00:00.000Z');
        expect(retryAfterMs('Thu, 22 Oct 2026 12:00:01 GMT', now)).toBe(1000);
    });

    test('missing or garbage header is 1s', () => {
        expect(retryAfterMs(null)).toBe(1000);
        expect(retryAfterMs('soon')).toBe(1000);
    });
});

describe('fetchRead', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
        jest.useFakeTimers();
        fetchMock.mockReset();
        (global as unknown as { fetch: unknown }).fetch = fetchMock;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function response(status: number, retryAfter?: string): Response {
        return { status, headers: { get: (name: string) => (name === 'Retry-After' ? retryAfter ?? null : null) } } as Response;
    }

    test('retries a GET once after Retry-After', async () => {
        fetchMock.mockResolvedValueOnce(response(429, '1')).mockResolvedValueOnce(response(200));
        const pending = fetchRead('/api/users/me');
        await jest.advanceTimersByTimeAsync(1000);
        const res = await pending;
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('does not replay a POST', async () => {
        fetchMock.mockResolvedValueOnce(response(429, '1'));
        const res = await fetchRead('/api/users/requests', { method: 'POST' });
        expect(res.status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
