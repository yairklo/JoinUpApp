import {
    CannotStartError,
    DownstreamFinishedError,
    ScheduleConflictError,
    TournamentApiError,
    VersionConflictError,
    buildQuery,
    toTournamentError,
    tournamentErrorMessage,
    tournamentsApi,
} from './tournaments';

const fetchMock = jest.fn();

function ok(body: unknown, status = 200) {
    return Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
}
function fail(status: number, body: Record<string, unknown>) {
    return Promise.resolve({ ok: false, status, statusText: 'x', json: () => Promise.resolve(body) });
}
function lastCall() {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    return { url: String(url), init: init as RequestInit };
}

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => ok({ ok: true }));
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('buildQuery', () => {
    test('skips empties, joins arrays, booleans become 1', () => {
        expect(buildQuery({})).toBe('');
        expect(buildQuery({ a: undefined, b: '', c: false, d: null })).toBe('');
        expect(buildQuery({ status: ['A', 'B'], mine: true, limit: 20, city: 'תל אביב' })).toBe(
            '?status=A%2CB&mine=1&limit=20&city=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91'
        );
    });
});

describe('request shapes', () => {
    test('list sends filters and optional auth', async () => {
        await tournamentsApi.list({ status: ['REGISTRATION_OPEN', 'IN_PROGRESS'], mine: true });
        const { url, init } = lastCall();
        expect(url).toMatch(/\/api\/tournaments\/\?status=REGISTRATION_OPEN%2CIN_PROGRESS&mine=1$/);
        expect(init.method).toBe('GET');
        expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });
    test('preview vs commit schedule', async () => {
        await tournamentsApi.previewSchedule('t1', { seed: 1 }, 'tok');
        expect(lastCall().url).toMatch(/\/t1\/schedule\/generate\?preview=1$/);
        await tournamentsApi.generateSchedule('t1', {}, 'tok');
        expect(lastCall().url).toMatch(/\/t1\/schedule\/generate$/);
    });
    test('saveResult is PUT with expectedVersion', async () => {
        await tournamentsApi.saveResult('t1', 'm1', { expectedVersion: 3, status: 'FINISHED', homeScore: 1, awayScore: 0 }, 'tok');
        const { url, init } = lastCall();
        expect(url).toMatch(/\/t1\/matches\/m1\/result$/);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body as string).expectedVersion).toBe(3);
    });
    test('delete/respond/decision', async () => {
        await tournamentsApi.removeMember('t1', 'tm1', 'u1', 'tok');
        expect(lastCall().init.method).toBe('DELETE');
        await tournamentsApi.respondToInvite('t1', 'tm1', 'u1', false, 'tok');
        expect(lastCall().url).toMatch(/\/teams\/tm1\/members\/u1\/respond$/);
        await tournamentsApi.decideTeam('t1', 'tm1', 'WAITLIST', 'tok');
        expect(JSON.parse(lastCall().init.body as string)).toEqual({ decision: 'WAITLIST' });
    });
    test('schedule filters and leaders query', async () => {
        await tournamentsApi.schedule('t1', { teamId: 'a', status: ['LIVE', 'SCHEDULED'] });
        expect(lastCall().url).toMatch(/\/t1\/schedule\?teamId=a&status=LIVE%2CSCHEDULED$/);
        await tournamentsApi.leaders('t1', { key: 'goals', limit: 5 });
        expect(lastCall().url).toMatch(/\/t1\/stats\/leaders\?key=goals&limit=5$/);
    });
});

describe('error mapping', () => {
    test('VERSION_CONFLICT carries currentVersion', async () => {
        fetchMock.mockImplementation(() => fail(409, { error: 'x', code: 'VERSION_CONFLICT', currentVersion: 7 }));
        const err = await tournamentsApi
            .saveResult('t1', 'm1', { expectedVersion: 1, status: 'LIVE' }, 'tok')
            .catch((e) => e);
        expect(err).toBeInstanceOf(VersionConflictError);
        expect(err).toBeInstanceOf(TournamentApiError);
        expect(err.currentVersion).toBe(7);
        expect(err.status).toBe(409);
    });
    test('DOWNSTREAM_FINISHED carries matchId and canForce', async () => {
        fetchMock.mockImplementation(() => fail(409, { error: 'x', code: 'DOWNSTREAM_FINISHED', matchId: 'm9', canForce: true }));
        const err = await tournamentsApi
            .saveResult('t1', 'm1', { expectedVersion: 1, status: 'FINISHED' }, 'tok')
            .catch((e) => e);
        expect(err).toBeInstanceOf(DownstreamFinishedError);
        expect(err.matchId).toBe('m9');
        expect(err.canForce).toBe(true);
    });
    test('CANNOT_START carries problems; schedule conflicts carry conflicts', () => {
        const a = toTournamentError(Object.assign(new Error('x'), { status: 409, code: 'CANNOT_START', body: { problems: ['p'] } }));
        expect(a).toBeInstanceOf(CannotStartError);
        expect((a as CannotStartError).problems).toEqual(['p']);
        const b = toTournamentError(Object.assign(new Error('x'), { status: 409, code: 'SCHEDULE_CONFLICT', body: { conflicts: [{ type: 'COURT_OVERLAP' }] } }));
        expect(b).toBeInstanceOf(ScheduleConflictError);
        expect((b as ScheduleConflictError).conflicts).toHaveLength(1);
    });
    test('plain codes and network errors', () => {
        const c = toTournamentError(Object.assign(new Error('x'), { status: 409, code: 'NAME_TAKEN' }));
        expect(c).toBeInstanceOf(TournamentApiError);
        expect(c.code).toBe('NAME_TAKEN');
        const n = toTournamentError(new Error('Failed to fetch'));
        expect(n.status).toBeUndefined();
        expect(n.code).toBeUndefined();
        expect(toTournamentError(c)).toBe(c);
    });
    test('tournamentErrorMessage maps known codes only', () => {
        expect(tournamentErrorMessage(Object.assign(new Error('x'), { code: 'NAME_TAKEN' }))).toMatch(/שם הקבוצה/);
        expect(tournamentErrorMessage(Object.assign(new Error('x'), { code: 'WHAT' }))).toBeNull();
        expect(tournamentErrorMessage(new Error('x'))).toBeNull();
    });
});
