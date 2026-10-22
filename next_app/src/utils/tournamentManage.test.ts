import {
    buildGenerateInput,
    buildResultInput,
    cancelConfirmMatches,
    cleanStats,
    describeStartProblem,
    groupConflicts,
    groupTeamsBySegment,
    initScoreForm,
    isKnockoutMatch,
    israelToIso,
    isoToIsraelParts,
    manualRankPatches,
    moveItem,
    needsPenalties,
    nextStatusAction,
    reopenAction,
    rosterValidity,
    seedPatches,
    shuffled,
    validateScheduleParams,
    validateScoreForm,
    type ScheduleParams,
    type ScoreForm,
    type ScoreFormCtx,
} from './tournamentManage';
import type { TournamentMatch, TournamentTeam } from '@/types/tournament';

const params = (over: Partial<ScheduleParams> = {}): ScheduleParams => ({
    days: [{ date: '2026-11-12', from: '16:00', to: '22:00' }],
    courtCount: 2,
    namedCourts: false,
    courtNames: [],
    matchMinutes: 40,
    breakMinutes: 10,
    minRestMinutes: 30,
    ...over,
});

describe('roster validity', () => {
    it('classifies missing, ok and over', () => {
        expect(rosterValidity(3, 5, 9)).toEqual({ state: 'missing', n: 2 });
        expect(rosterValidity(5, 5, 9)).toEqual({ state: 'ok' });
        expect(rosterValidity(9, 5, 9)).toEqual({ state: 'ok' });
        expect(rosterValidity(11, 5, 9)).toEqual({ state: 'over', n: 2 });
    });
});

describe('groupTeamsBySegment', () => {
    it('buckets by status and sorts approved by seed', () => {
        const mk = (id: string, status: TournamentTeam['status'], seed?: number) =>
            ({ id, name: id, status, seed } as unknown as TournamentTeam);
        const g = groupTeamsBySegment([mk('c', 'APPROVED', 2), mk('a', 'APPROVED', 1), mk('p', 'PENDING'), mk('w', 'WITHDRAWN')]);
        expect(g.APPROVED.map((t) => t.id)).toEqual(['a', 'c']);
        expect(g.PENDING).toHaveLength(1);
        expect(g.OTHER).toHaveLength(1);
    });
});

describe('reordering', () => {
    it('moves and clamps', () => {
        expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
        expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
        expect(moveItem(['a'], 4, 0)).toEqual(['a']);
    });
    it('shuffles deterministically with an rng and keeps all items', () => {
        const out = shuffled([1, 2, 3, 4], () => 0);
        expect([...out].sort()).toEqual([1, 2, 3, 4]);
    });
    it('only patches changed seeds', () => {
        const cur = [
            { id: 'a', seed: 1 },
            { id: 'b', seed: 2 },
            { id: 'c', seed: null },
        ];
        expect(seedPatches(['a', 'c', 'b'], cur)).toEqual([
            { teamId: 'c', seed: 2 },
            { teamId: 'b', seed: 3 },
        ]);
    });
    it('assigns manual ranks from the best tied rank', () => {
        expect(manualRankPatches([{ rank: 2 }, { rank: 2 }], ['x', 'y'])).toEqual([
            { teamId: 'x', manualRank: 2 },
            { teamId: 'y', manualRank: 3 },
        ]);
    });
});

describe('Israel time', () => {
    it('converts winter and summer wall time to UTC', () => {
        expect(israelToIso('2026-01-15', '18:30')).toBe('2026-01-15T16:30:00.000Z');
        expect(israelToIso('2026-07-15', '18:30')).toBe('2026-07-15T15:30:00.000Z');
    });
    it('round-trips', () => {
        const iso = israelToIso('2026-11-12', '09:05') as string;
        expect(isoToIsraelParts(iso)).toEqual({ date: '2026-11-12', time: '09:05' });
    });
    it('rejects malformed input', () => {
        expect(israelToIso('12/11/2026', '18:30')).toBeNull();
        expect(israelToIso('2026-11-12', '6pm')).toBeNull();
    });
});

describe('schedule params', () => {
    it('accepts a valid setup', () => {
        expect(validateScheduleParams(params())).toEqual([]);
    });
    it('flags empty, inverted, duplicate days and bad courts', () => {
        expect(validateScheduleParams(params({ days: [] }))).toEqual([{ code: 'NO_DAYS' }]);
        expect(validateScheduleParams(params({ days: [{ date: '2026-11-12', from: '20:00', to: '18:00' }] }))).toEqual([
            { code: 'DAY_RANGE', index: 0 },
        ]);
        const dup = validateScheduleParams(
            params({
                days: [
                    { date: '2026-11-12', from: '10:00', to: '12:00' },
                    { date: '2026-11-12', from: '13:00', to: '15:00' },
                ],
            })
        );
        expect(dup).toEqual([{ code: 'DAY_DUPLICATE', index: 1 }]);
        expect(validateScheduleParams(params({ courtCount: 0 }))).toEqual([{ code: 'COURTS' }]);
        expect(validateScheduleParams(params({ namedCourts: true, courtNames: ['A', 'A'] }))).toEqual([{ code: 'COURT_NAMES' }]);
    });
    it('builds the request body with court names or a count', () => {
        expect(buildGenerateInput(params()).schedule?.courts).toBe(2);
        expect(buildGenerateInput(params({ namedCourts: true, courtNames: [' צפון ', '', 'דרום'] })).schedule?.courts).toEqual(['צפון', 'דרום']);
        expect(buildGenerateInput(params(), { allowConflicts: true }).allowConflicts).toBe(true);
        expect(buildGenerateInput(params({ seed: 7 })).seed).toBe(7);
    });
});

describe('conflict grouping', () => {
    const ctx = {
        numberById: new Map([
            ['m1', 5],
            ['m2', 7],
            ['k3', 9],
        ]),
        teamNameById: new Map([['t1', 'הכחולים']]),
        minRestMinutes: 30,
    };
    const conflicts = [
        { type: 'OUTSIDE_WINDOW' as const, matchIds: ['k3'], message: 'english text' },
        { type: 'TEAM_REST' as const, matchIds: ['m1', 'm2'], teamId: 't1' },
        { type: 'COURT_OVERLAP' as const, matchIds: ['m1', 'm2'], court: 'מגרש 2' },
        { type: 'NO_SLOT' as const, matchIds: ['k3'] },
    ];
    it('sorts by severity order, counts types and collects ids', () => {
        const g = groupConflicts(conflicts, ctx);
        expect(g.items.map((i) => i.type)).toEqual(['NO_SLOT', 'COURT_OVERLAP', 'TEAM_REST', 'OUTSIDE_WINDOW']);
        expect(g.total).toBe(4);
        expect(g.countByType.COURT_OVERLAP).toBe(1);
        expect([...g.conflictedIds].sort()).toEqual(['k3', 'm1', 'm2']);
    });
    it('uses plain Hebrew with numbers and team names, never the server message', () => {
        const g = groupConflicts(conflicts, ctx);
        const rest = g.items.find((i) => i.type === 'TEAM_REST');
        expect(rest?.body).toBe('להכחולים יש פחות מ-30 דק׳ בין #5 ל-#7.');
        const court = g.items.find((i) => i.type === 'COURT_OVERLAP');
        expect(court?.body).toContain('#5 ו-#7');
        expect(court?.body).toContain('מגרש 2');
        expect(g.items.every((i) => !i.body.includes('english'))).toBe(true);
    });
    it('handles empty', () => {
        expect(groupConflicts([], ctx)).toMatchObject({ total: 0, items: [] });
    });
});

describe('status controls', () => {
    it('walks the lifecycle', () => {
        expect(nextStatusAction('DRAFT')?.to).toBe('REGISTRATION_OPEN');
        expect(nextStatusAction('REGISTRATION_OPEN')?.to).toBe('REGISTRATION_CLOSED');
        expect(nextStatusAction('REGISTRATION_CLOSED')?.to).toBe('IN_PROGRESS');
        expect(nextStatusAction('IN_PROGRESS')?.to).toBe('COMPLETED');
        expect(nextStatusAction('COMPLETED')).toBeNull();
        expect(nextStatusAction('CANCELLED')).toBeNull();
    });
    it('reopens only before a schedule exists', () => {
        expect(reopenAction('REGISTRATION_CLOSED', false)?.to).toBe('REGISTRATION_OPEN');
        expect(reopenAction('REGISTRATION_CLOSED', true)).toBeNull();
        expect(reopenAction('IN_PROGRESS', false)).toBeNull();
    });
    it('type-to-confirm ignores case and padding', () => {
        expect(cancelConfirmMatches(' גביע הקיץ ', 'גביע הקיץ')).toBe(true);
        expect(cancelConfirmMatches('', '')).toBe(false);
        expect(cancelConfirmMatches('גביע', 'גביע הקיץ')).toBe(false);
    });
    it('describes CANNOT_START problems', () => {
        const names = new Map([['t1', 'הכחולים']]);
        const t = { minPlayersPerTeam: 5, maxPlayersPerTeam: 9 };
        expect(describeStartProblem({ code: 'TOO_FEW_TEAMS', approved: 2, minTeams: 4 }, t, names).text).toBe(
            'רק 2 קבוצות מאושרות, צריך לפחות 4'
        );
        expect(describeStartProblem({ code: 'TOO_FEW_PLAYERS', teamId: 't1', players: 3 }, t, names)).toMatchObject({
            code: 'TOO_FEW_PLAYERS',
            teamId: 't1',
            text: 'הכחולים: 3 שחקנים (צריך 5–9)',
        });
        expect(describeStartProblem({ code: 'NO_SCHEDULE' }, t, names).code).toBe('NO_SCHEDULE');
        expect(describeStartProblem(null, t, names).code).toBe('OTHER');
    });
});

describe('score form', () => {
    const slot = (id: string | null) => ({ teamId: id, team: null, source: null });
    const match = (over: Partial<TournamentMatch> = {}): TournamentMatch => ({
        id: 'm', number: 1, stageId: 's', groupId: null, round: 1, status: 'SCHEDULED',
        home: slot('h'), away: slot('a'), scheduledAt: null, fieldId: null, courtLabel: null,
        homeScore: null, awayScore: null, homePenalties: null, awayPenalties: null, details: null,
        winnerTeamId: null, version: 3, ...over,
    });
    const ctx = (over: Partial<ScoreFormCtx> = {}): ScoreFormCtx => ({
        sport: 'SOCCER', bestOf: 3, knockout: false, homeTeamId: 'h', awayTeamId: 'a', penaltiesShown: false, ...over,
    });
    const form = (over: Partial<ScoreForm> = {}): ScoreForm => ({
        ...initScoreForm(match(), 'SOCCER'), ...over,
    });

    it('defaults to FINISHED 0:0 and keeps LIVE', () => {
        expect(initScoreForm(match(), 'SOCCER')).toMatchObject({ status: 'FINISHED', home: 0, away: 0 });
        expect(initScoreForm(match({ status: 'LIVE', homeScore: 1, awayScore: 0 }), 'SOCCER')).toMatchObject({ status: 'LIVE', home: 1 });
    });
    it('recovers the forfeiting team from the winner', () => {
        const f = initScoreForm(match({ status: 'FORFEIT', winnerTeamId: 'a', homeScore: 0, awayScore: 3 }), 'SOCCER');
        expect(f.forfeitBy).toBe('h');
    });
    it('knockout detection by format and group', () => {
        expect(isKnockoutMatch({ format: 'KNOCKOUT' }, { groupId: null })).toBe(true);
        expect(isKnockoutMatch({ format: 'GROUPS_KNOCKOUT' }, { groupId: 'g' })).toBe(false);
        expect(isKnockoutMatch({ format: 'GROUPS_KNOCKOUT' }, { groupId: null })).toBe(true);
        expect(isKnockoutMatch({ format: 'LEAGUE' }, { groupId: null })).toBe(false);
    });
    it('shows penalties only for a finished knockout draw (or after NEEDS_PENALTIES)', () => {
        expect(needsPenalties(form({ home: 2, away: 2 }), 'SOCCER', true)).toBe(true);
        expect(needsPenalties(form({ home: 2, away: 1 }), 'SOCCER', true)).toBe(false);
        expect(needsPenalties(form({ home: 2, away: 2 }), 'SOCCER', false)).toBe(false);
        expect(needsPenalties(form({ home: 2, away: 2, status: 'LIVE' }), 'SOCCER', true)).toBe(false);
        expect(needsPenalties(form({ home: 2, away: 1 }), 'SOCCER', false, true)).toBe(true);
        expect(needsPenalties(form({ home: 2, away: 2 }), 'TENNIS', true)).toBe(false);
    });
    it('validates penalties, forfeit and teams', () => {
        expect(validateScoreForm(form({ home: 1, away: 1, penHome: 3, penAway: 3 }), ctx({ penaltiesShown: true }))).toEqual(['PENALTIES']);
        expect(validateScoreForm(form({ home: 1, away: 1, penHome: 4, penAway: 3 }), ctx({ penaltiesShown: true }))).toEqual([]);
        expect(validateScoreForm(form({ status: 'FORFEIT' }), ctx())).toEqual(['FORFEIT_TEAM']);
        expect(validateScoreForm(form({ status: 'FORFEIT', forfeitBy: 'a' }), ctx())).toEqual([]);
        expect(validateScoreForm(form(), ctx({ homeTeamId: null }))).toEqual(['TEAMS_UNKNOWN']);
    });
    it('validates tennis sets against bestOf', () => {
        const c = ctx({ sport: 'TENNIS' });
        expect(validateScoreForm(form({ sets: [[6, 4]] }), c)).toEqual(['TENNIS_SETS']);
        expect(validateScoreForm(form({ sets: [[6, 4], [6, 3]] }), c)).toEqual([]);
        expect(validateScoreForm(form({ sets: [[6, 4], [6, 3]], status: 'LIVE' }), c)).toEqual([]);
    });
    it('builds request bodies per status', () => {
        expect(buildResultInput(form({ home: 2, away: 1 }), ctx())).toEqual({ status: 'FINISHED', homeScore: 2, awayScore: 1 });
        expect(buildResultInput(form({ home: 2, away: 1, status: 'LIVE' }), ctx())).toEqual({ status: 'LIVE', homeScore: 2, awayScore: 1 });
        expect(buildResultInput(form({ status: 'FORFEIT', forfeitBy: 'h' }), ctx())).toEqual({ status: 'FORFEIT', forfeitBy: 'h' });
        expect(
            buildResultInput(form({ home: 1, away: 1, penHome: 5, penAway: 4 }), ctx({ penaltiesShown: true }))
        ).toMatchObject({ penalties: { home: 5, away: 4 } });
        // Penalties never sent when not a draw.
        expect(buildResultInput(form({ home: 2, away: 1, penHome: 5, penAway: 4 }), ctx({ penaltiesShown: true }))).not.toHaveProperty('penalties');
        expect(buildResultInput(form({ sets: [[6, 4], [6, 3]] }), ctx({ sport: 'TENNIS' }))).toEqual({
            status: 'FINISHED',
            details: { sets: [[6, 4], [6, 3]] },
        });
    });
    it('sends stats only when finished and drops zeros', () => {
        const stats = { u1: { goals: 2, assists: 0 }, u2: { goals: 0 } };
        expect(cleanStats('SOCCER', stats)).toEqual({ u1: { goals: 2 } });
        expect(buildResultInput(form({ home: 2, away: 0, stats }), ctx())).toMatchObject({ stats: { u1: { goals: 2 } } });
        expect(buildResultInput(form({ home: 2, away: 0, stats, status: 'LIVE' }), ctx())).not.toHaveProperty('stats');
    });
});
