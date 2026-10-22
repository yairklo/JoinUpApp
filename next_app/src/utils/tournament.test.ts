import {
    MATCH_STATUS_TOKENS,
    TOURNAMENT_STATUS_TOKENS,
    describeSlot,
    groupNameMap,
    hasScore,
    matchNumberMap,
    setsWon,
    winnerSide,
} from './tournament';
import type { MatchSlot, TournamentMatch } from '@/types/tournament';

const team = { id: 't1', name: 'הכחולים', color: '#00f', logoUrl: null };
const slot = (over: Partial<MatchSlot> = {}): MatchSlot => ({ teamId: null, team: null, source: null, ...over });

describe('status tokens', () => {
    test('every tournament status has a Hebrew label', () => {
        for (const t of Object.values(TOURNAMENT_STATUS_TOKENS)) expect(t.label.he.length).toBeGreaterThan(0);
        expect(TOURNAMENT_STATUS_TOKENS.COMPLETED.icon).toBe('trophy');
    });
    test('scheduled and finished matches show no chip; live has the dot', () => {
        expect(MATCH_STATUS_TOKENS.SCHEDULED).toBeNull();
        expect(MATCH_STATUS_TOKENS.FINISHED).toBeNull();
        expect(MATCH_STATUS_TOKENS.LIVE?.icon).toBe('liveDot');
        expect(MATCH_STATUS_TOKENS.FORFEIT?.variant).toBe('outlined');
    });
});

describe('describeSlot', () => {
    const ctx = {
        matchNumberById: matchNumberMap([{ id: 'm1', number: 7 }]),
        groupNameById: groupNameMap([{ groups: [{ id: 'g1', name: 'א׳' }] }]),
    };
    test('team wins over source', () => {
        expect(describeSlot(slot({ team }), ctx)).toEqual({ kind: 'team', team });
    });
    test('winner/loser of match number (he + en)', () => {
        const w = slot({ source: { type: 'WINNER_OF', matchId: 'm1' } });
        const l = slot({ source: { type: 'LOSER_OF', matchId: 'm1' } });
        expect(describeSlot(w, ctx)).toMatchObject({ text: 'המנצחת במשחק 7' });
        expect(describeSlot(l, ctx)).toMatchObject({ text: 'המפסידה במשחק 7' });
        expect(describeSlot(w, { ...ctx, locale: 'en' })).toMatchObject({ text: 'Winner of match 7' });
    });
    test('unknown match number degrades without "undefined"', () => {
        const w = slot({ source: { type: 'WINNER_OF', matchId: 'zzz' } });
        expect(describeSlot(w, ctx)).toMatchObject({ text: 'המנצחת במשחק' });
    });
    test('group rank', () => {
        const g = slot({ source: { type: 'GROUP_RANK', groupId: 'g1', rank: 2 } });
        expect(describeSlot(g, ctx)).toMatchObject({ text: 'מקום 2 בבית א׳', placeholderType: 'GROUP_RANK' });
        expect(describeSlot(g, { ...ctx, locale: 'en' })).toMatchObject({ text: '2 in group א׳' });
    });
    test('seed, bye, tbd', () => {
        expect(describeSlot({ source: { type: 'SEED', seed: 3 } })).toMatchObject({ text: 'מדורגת 3' });
        expect(describeSlot({ source: { type: 'BYE' } })).toMatchObject({ text: 'פטור' });
        expect(describeSlot(slot())).toMatchObject({ text: 'ייקבע בהמשך', placeholderType: 'TBD' });
        expect(describeSlot(null, { locale: 'en' })).toMatchObject({ text: 'TBD' });
    });
});

describe('score helpers', () => {
    const base = {
        status: 'FINISHED',
        home: slot({ teamId: 'a' }),
        away: slot({ teamId: 'b' }),
        winnerTeamId: null,
        homeScore: 2,
        awayScore: 1,
        homePenalties: null,
        awayPenalties: null,
    } as Pick<TournamentMatch, 'status' | 'home' | 'away' | 'winnerTeamId' | 'homeScore' | 'awayScore' | 'homePenalties' | 'awayPenalties'>;

    test('winnerSide prefers winnerTeamId, then score, then penalties', () => {
        expect(winnerSide({ ...base, winnerTeamId: 'b' })).toBe('away');
        expect(winnerSide(base)).toBe('home');
        expect(winnerSide({ ...base, homeScore: 1, awayScore: 1 })).toBeNull();
        expect(winnerSide({ ...base, homeScore: 1, awayScore: 1, homePenalties: 3, awayPenalties: 4 })).toBe('away');
        expect(winnerSide({ ...base, status: 'LIVE' })).toBeNull();
    });
    test('setsWon', () => {
        expect(setsWon([[6, 4], [3, 6], [10, 7]])).toEqual([2, 1]);
        expect(setsWon(null)).toEqual([0, 0]);
    });
    test('hasScore', () => {
        expect(hasScore({ status: 'LIVE', homeScore: 0, awayScore: 0 })).toBe(true);
        expect(hasScore({ status: 'SCHEDULED', homeScore: null, awayScore: null })).toBe(false);
        expect(hasScore({ status: 'POSTPONED', homeScore: 1, awayScore: 0 })).toBe(false);
    });
});
