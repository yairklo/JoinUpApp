import {
    bracketHeight,
    bracketRoundName,
    buildMatchesIcs,
    currentRoundIndex,
    dayKey,
    defaultDay,
    filterMatches,
    displayGroupName,
    displayStageName,
    formatGd,
    groupMatches,
    isByeMatch,
    isQualifier,
    leaderPositions,
    rankLabel,
    roundStride,
    roundTopOffset,
    splitThirdPlace,
    teamPathIds,
} from './tournamentViews';
import type { BracketRound, MatchSlot, TournamentMatch } from '@/types/tournament';

const team = (id: string) => ({ id, name: id, color: null, logoUrl: null });
const slot = (id: string | null, source: MatchSlot['source'] = null): MatchSlot => ({ teamId: id, team: id ? team(id) : null, source });
const match = (over: Partial<TournamentMatch> = {}): TournamentMatch => ({
    id: 'm', number: 1, stageId: 's', groupId: null, round: 1, status: 'SCHEDULED', home: slot('a'), away: slot('b'),
    scheduledAt: null, fieldId: null, courtLabel: null, homeScore: null, awayScore: null, homePenalties: null,
    awayPenalties: null, details: null, winnerTeamId: null, version: 1, ...over,
});

test('dayKey uses Israel time', () => {
    expect(dayKey('2026-11-12T22:30:00Z')).toBe('2026-11-13');
    expect(dayKey('2026-11-12T10:30:00Z')).toBe('2026-11-12');
});

test('defaultDay prefers today, then next upcoming, then last', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    expect(defaultDay(['2026-11-10', '2026-11-12'], now)).toBe('2026-11-12');
    expect(defaultDay(['2026-11-10', '2026-11-14'], now)).toBe('2026-11-14');
    expect(defaultDay(['2026-11-01'], now)).toBe('2026-11-01');
    expect(defaultDay([], now)).toBe('ALL');
});

test('filterMatches by team, status and day', () => {
    const ms = [
        match({ id: '1', scheduledAt: '2026-11-12T10:00:00Z', status: 'LIVE' }),
        match({ id: '2', home: slot('c'), away: slot('d'), scheduledAt: '2026-11-13T10:00:00Z', status: 'FINISHED' }),
    ];
    const all = { day: 'ALL' as const, teamId: null, status: 'ALL' as const, stageId: null };
    expect(filterMatches(ms, all)).toHaveLength(2);
    expect(filterMatches(ms, { ...all, teamId: 'c' }).map((m) => m.id)).toEqual(['2']);
    expect(filterMatches(ms, { ...all, status: 'LIVE' }).map((m) => m.id)).toEqual(['1']);
    expect(filterMatches(ms, { ...all, status: 'DONE' }).map((m) => m.id)).toEqual(['2']);
    expect(filterMatches(ms, { ...all, day: '2026-11-13' }).map((m) => m.id)).toEqual(['2']);
});

test('groupMatches groups by day when multi-day, by round otherwise', () => {
    const multi = groupMatches([match({ id: '1', scheduledAt: '2026-11-12T10:00:00Z' }), match({ id: '2', scheduledAt: '2026-11-13T10:00:00Z' })]);
    expect(multi).toHaveLength(2);
    const single = groupMatches([match({ id: '1', round: 1 }), match({ id: '2', round: 2, number: 2 }), match({ id: '3', round: 2, number: 3 })]);
    expect(single.map((g) => g.title)).toEqual(['מחזור 1', 'מחזור 2']);
    expect(single[1].matches).toHaveLength(2);
});

test('display names translate stored English stage and group names', () => {
    expect(displayStageName('League')).toBe('ליגה');
    expect(displayStageName('Matches')).toBe('משחקים');
    expect(displayGroupName('Group A')).toBe('א');
    expect(displayGroupName('א')).toBe('א');
});

test('formatGd uses a real minus', () => {
    expect(formatGd(5)).toBe('+5');
    expect(formatGd(-2)).toBe('−2');
    expect(formatGd(0)).toBe('0');
});

test('rankLabel / isQualifier', () => {
    expect(rankLabel({ rank: 4, tied: true })).toBe('=4');
    expect(rankLabel({ rank: 4, tied: false })).toBe('4');
    expect(isQualifier({ rank: 2 }, 2)).toBe(true);
    expect(isQualifier({ rank: 3 }, 2)).toBe(false);
    expect(isQualifier({ rank: 1 }, undefined)).toBe(false);
});

test('bracket names and geometry', () => {
    expect(bracketRoundName('QUARTER_FINAL')).toBe('רבע גמר');
    expect(bracketRoundName('ROUND_OF_64')).toBe('שלב 64 האחרונות');
    expect(roundTopOffset(1)).toBe(0);
    expect(roundTopOffset(2, 72, 16)).toBe(44);
    expect(roundStride(3, 72, 16)).toBe(352);
    expect(bracketHeight(8, 72, 16)).toBe(8 * 88 - 16);
});

test('splitThirdPlace lifts the third-place match out', () => {
    const rounds: BracketRound[] = [
        { round: 1, name: 'SEMI_FINAL', matches: [match({ id: 's1' }), match({ id: 's2' })] },
        { round: 2, name: 'FINAL', matches: [match({ id: 'f' }), match({ id: 'tp', isThirdPlace: true })] },
    ];
    const { main, thirdPlace } = splitThirdPlace(rounds);
    expect(thirdPlace?.id).toBe('tp');
    expect(main[1].matches.map((m) => m.id)).toEqual(['f']);
});

test('isByeMatch, teamPathIds, currentRoundIndex', () => {
    expect(isByeMatch(match({ away: slot(null) }))).toBe(true);
    expect(isByeMatch(match({ away: slot(null, { type: 'WINNER_OF', matchId: 'x' }) }))).toBe(false);
    const rounds: BracketRound[] = [
        { round: 1, name: 'SEMI_FINAL', matches: [match({ id: 's1', status: 'FINISHED' })] },
        { round: 2, name: 'FINAL', matches: [match({ id: 'f' })] },
    ];
    expect([...teamPathIds(rounds, 'a')]).toEqual(['s1', 'f']);
    expect(teamPathIds(rounds, null).size).toBe(0);
    expect(currentRoundIndex(rounds)).toBe(1);
    expect(currentRoundIndex([{ round: 1, name: 'FINAL', matches: [match({ status: 'FINISHED' })] }])).toBe(0);
});

test('leaderPositions shares equal values', () => {
    expect(leaderPositions([{ value: 5 }, { value: 3 }, { value: 3 }, { value: 1 }])).toEqual(['1', '=2', '=2', '4']);
});

test('buildMatchesIcs emits an event per timed match', () => {
    const ics = buildMatchesIcs([
        { id: 'a', scheduledAt: '2026-11-12T10:00:00Z', summary: 'א, ב', location: 'מגרש 2' },
        { id: 'b', scheduledAt: null, summary: 'x' },
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('DTSTART:20261112T100000Z');
    expect(ics).toContain('DTEND:20261112T110000Z');
    expect(ics).toContain('SUMMARY:א\\, ב');
});
