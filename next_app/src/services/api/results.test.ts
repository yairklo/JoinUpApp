import { adminUserReportsApi, resultsApi, userReportsApi, userStatsApi } from './results';
import { withoutReport } from '@/hooks/useAdminUserReports';
import type { AdminUserReport } from '@/types/matchResult';

const fetchMock = jest.fn();

function ok(body: unknown, status = 200) {
    return Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
}

function lastCall() {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return { url: String(url), init: init as RequestInit };
}

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => ok({ ok: true }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('resultsApi', () => {
    test('get', async () => {
        await resultsApi.get('g1', 'tok');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/games\/g1\/result$/);
        expect(init.method).toBe('GET');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    });

    test('save is a PUT with the body', async () => {
        const body = { sides: [{ label: 'A', score: 2 }, { label: 'B', score: 1 }] as never };
        await resultsApi.save('g1', body, 'tok');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/games\/g1\/result$/);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body as string)).toEqual(body);
    });

    test('remove is a DELETE', async () => {
        await resultsApi.remove('g1', 'tok');
        expect(lastCall().init.method).toBe('DELETE');
    });

    test('dispute is a POST', async () => {
        await resultsApi.dispute('g1', { details: 'x' }, 'tok');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/games\/g1\/result\/dispute$/);
        expect(init.method).toBe('POST');
    });

    test('surfaces the server error code', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                json: () => Promise.resolve({ error: 'The result is locked', code: 'RESULT_LOCKED' }),
            })
        );
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(resultsApi.remove('g1', 'tok')).rejects.toMatchObject({ status: 403, code: 'RESULT_LOCKED' });
    });
});

describe('userStatsApi', () => {
    test('get without sport or token', async () => {
        await userStatsApi.get('u1');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/users\/u1\/stats$/);
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    test('get with sport encodes the query', async () => {
        await userStatsApi.get('u1', { sport: 'SOCCER', token: 't' });
        expect(lastCall().url).toMatch(/\/stats\?sport=SOCCER$/);
    });

    test('setHideMatchStats PUTs only that flag', async () => {
        await userStatsApi.setHideMatchStats(true, 'tok');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/users\/profile\/settings$/);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body as string)).toEqual({ hideMatchStats: true });
    });
});

describe('userReportsApi / adminUserReportsApi', () => {
    test('submit', async () => {
        await userReportsApi.submit({ targetId: 'u2', reason: 'CHEATING', gameId: 'g1' }, 'tok');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/user-reports$/);
        expect(JSON.parse(init.body as string)).toEqual({ targetId: 'u2', reason: 'CHEATING', gameId: 'g1' });
    });

    test('admin list/resolve/dismiss', async () => {
        await adminUserReportsApi.list('OPEN', 'tok');
        expect(lastCall().url).toMatch(/\/api\/admin\/user-reports\?status=OPEN$/);
        await adminUserReportsApi.resolve('r1', { resolution: 'done', action: 'BAN' }, 'tok');
        expect(lastCall().url).toMatch(/\/user-reports\/r1\/resolve$/);
        expect(JSON.parse(lastCall().init.body as string)).toEqual({ resolution: 'done', action: 'BAN' });
        await adminUserReportsApi.dismiss('r1', 'tok');
        expect(lastCall().url).toMatch(/\/user-reports\/r1\/dismiss$/);
        expect(lastCall().init.method).toBe('POST');
    });
});

test('withoutReport removes by id', () => {
    const rows = [{ id: 'a' }, { id: 'b' }] as AdminUserReport[];
    expect(withoutReport(rows, 'a').map((r) => r.id)).toEqual(['b']);
});
