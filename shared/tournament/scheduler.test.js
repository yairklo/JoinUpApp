const { scheduleMatches, findConflicts } = require('./scheduler');
const { generateRoundRobin, flattenRounds } = require('./roundRobin');
const { generateBracket } = require('./bracket');

const day = (date, from, to) => ({ start: `${date}T${from}:00Z`, end: `${date}T${to}:00Z` });
const ids = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const toInputs = (teams, legs = 1) =>
  flattenRounds(generateRoundRobin(teams, { legs })).map((m, i) => ({ id: `m${i}`, homeTeamId: m.home, awayTeamId: m.away }));

describe('scheduleMatches', () => {
  it('rejects bad config', () => {
    expect(() => scheduleMatches([], { windows: [], matchMinutes: 0 })).toThrow();
    expect(() => scheduleMatches([], { windows: [], matchMinutes: 30, courts: [] })).toThrow();
  });

  it('packs matches onto courts in order, respecting window ends', () => {
    const matches = [1, 2, 3, 4, 5].map((n) => ({ id: `m${n}`, homeTeamId: `H${n}`, awayTeamId: `A${n}` }));
    const { scheduled, conflicts } = scheduleMatches(matches, {
      windows: [day('2026-11-07', '09:00', '10:00')], courts: 2, matchMinutes: 30,
    });
    expect(conflicts.map((c) => c.matchIds)).toEqual([['m5']]); // 2 courts x 2 slots = 4 fit
    expect(scheduled.map((x) => [x.scheduledAt.slice(11, 16), x.court])).toEqual([
      ['09:00', 1], ['09:00', 2], ['09:30', 1], ['09:30', 2],
    ]);
  });

  it('returns NO_SLOT conflicts instead of dropping matches', () => {
    const matches = [1, 2, 3].map((n) => ({ id: `m${n}`, homeTeamId: `H${n}`, awayTeamId: `A${n}` }));
    const { scheduled, conflicts } = scheduleMatches(matches, {
      windows: [day('2026-11-07', '09:00', '10:00')], courts: 1, matchMinutes: 30,
    });
    expect(scheduled).toHaveLength(2);
    expect(conflicts).toEqual([expect.objectContaining({ type: 'NO_SLOT', matchIds: ['m3'] })]);
  });

  it('applies breaks, minimum rest and uses several windows', () => {
    const matches = [
      { id: 'a', homeTeamId: 'X', awayTeamId: 'Y' },
      { id: 'b', homeTeamId: 'X', awayTeamId: 'Z' },
      { id: 'c', homeTeamId: 'P', awayTeamId: 'Q' },
    ];
    const cfg = {
      windows: [day('2026-11-07', '09:00', '10:30'), day('2026-11-08', '09:00', '12:00')],
      courts: 1, matchMinutes: 30, breakMinutes: 10, minRestMinutes: 60,
    };
    const { scheduled, conflicts } = scheduleMatches(matches, cfg);
    expect(conflicts).toEqual([]);
    const at = Object.fromEntries(scheduled.map((s) => [s.matchId, s.scheduledAt.slice(0, 16)]));
    expect(at.a).toBe('2026-11-07T09:00');
    expect(at.c).toBe('2026-11-07T09:40'); // break of 10 on the same court; 09:40 + 30 ends 10:10, inside 10:30
    expect(at.b).toBe('2026-11-08T09:00'); // X needs 60 min rest; day 1 window has no later slot
    expect(findConflicts(scheduled.map((s) => ({ ...matches.find((m) => m.id === s.matchId), id: s.matchId, scheduledAt: s.scheduledAt, court: s.court })), cfg)).toEqual([]);
  });

  it('honours dependsOn and notBefore regardless of input order', () => {
    const { scheduled, conflicts } = scheduleMatches(
      [
        { id: 'final', dependsOn: ['semi1', 'semi2'] },
        { id: 'semi1', homeTeamId: 'A', awayTeamId: 'B' },
        { id: 'semi2', homeTeamId: 'C', awayTeamId: 'D', notBefore: '2026-11-07T10:00:00Z' },
      ],
      { windows: [day('2026-11-07', '09:00', '14:00')], courts: 2, matchMinutes: 60, minRestMinutes: 30 },
    );
    expect(conflicts).toEqual([]);
    const at = Object.fromEntries(scheduled.map((s) => [s.matchId, s.scheduledAt.slice(11, 16)]));
    expect(at.semi1).toBe('09:00');
    expect(at.semi2).toBe('10:00');
    expect(at.final).toBe('11:30');
  });

  it('reports dependency problems and avoids existing fixed matches', () => {
    const { scheduled, conflicts } = scheduleMatches(
      [{ id: 'x', homeTeamId: 'A', awayTeamId: 'B', dependsOn: ['ghost'] }, { id: 'y', homeTeamId: 'A', awayTeamId: 'B' }],
      {
        windows: [day('2026-11-07', '09:00', '11:00')], courts: 1, matchMinutes: 60,
        existing: [{ id: 'fixed', homeTeamId: 'C', awayTeamId: 'D', scheduledAt: '2026-11-07T09:00:00Z', court: 1 }],
      },
    );
    expect(conflicts).toEqual([expect.objectContaining({ type: 'DEPENDENCY_UNSCHEDULED', matchIds: ['x', 'ghost'] })]);
    expect(scheduled).toEqual([expect.objectContaining({ matchId: 'y', scheduledAt: '2026-11-07T10:00:00.000Z' })]);
  });

  it('is deterministic', () => {
    const cfg = { windows: [day('2026-11-07', '08:00', '20:00')], courts: 3, matchMinutes: 40, breakMinutes: 5, minRestMinutes: 20 };
    expect(scheduleMatches(toInputs(ids(8)), cfg)).toEqual(scheduleMatches(toInputs(ids(8)), cfg));
  });

  it('property N=2..32 round robin: all matches placed, no court or team double booking, rest respected', () => {
    for (let n = 2; n <= 32; n += 1) {
      const inputs = toInputs(ids(n));
      const cfg = {
        windows: ['07', '08', '09'].map((d) => day(`2026-11-${d}`, '08:00', '20:00')),
        courts: 4, matchMinutes: 40, breakMinutes: 5, minRestMinutes: 30,
      };
      const { scheduled, conflicts } = scheduleMatches(inputs, cfg);
      expect(conflicts.filter((c) => c.type !== 'NO_SLOT')).toEqual([]);
      const placedIds = new Set(scheduled.map((s) => s.matchId));
      expect(placedIds.size + conflicts.length).toBe(inputs.length); // nothing silently dropped
      const entries = scheduled.map((s) => ({ ...inputs.find((m) => m.id === s.matchId), scheduledAt: s.scheduledAt, court: s.court }));
      expect(findConflicts(entries, cfg)).toEqual([]);
    }
  });

  it('schedules a bracket with feeder dependencies in round order', () => {
    const b = generateBracket(ids(8));
    const inputs = b.matches.filter((m) => m.status !== 'BYE').map((m) => ({
      id: m.id,
      homeTeamId: m.home.teamId,
      awayTeamId: m.away.teamId,
      dependsOn: [m.home, m.away].filter((s) => s.source?.type === 'WINNER_OF').map((s) => s.source.matchId),
    }));
    const { scheduled, conflicts } = scheduleMatches(inputs, {
      windows: [day('2026-11-07', '08:00', '20:00')], courts: 2, matchMinutes: 45, minRestMinutes: 15,
    });
    expect(conflicts).toEqual([]);
    const end = Object.fromEntries(scheduled.map((s) => [s.matchId, Date.parse(s.endsAt)]));
    const start = Object.fromEntries(scheduled.map((s) => [s.matchId, Date.parse(s.scheduledAt)]));
    expect(start.R2M1).toBeGreaterThanOrEqual(Math.max(end.R1M1, end.R1M2) + 15 * 60000);
    expect(start.R3M1).toBeGreaterThanOrEqual(Math.max(end.R2M1, end.R2M2) + 15 * 60000);
  });
});

describe('findConflicts', () => {
  const base = { matchMinutes: 60, courts: 2, minRestMinutes: 30, breakMinutes: 0 };
  it('flags court overlaps, team double booking, short rest and out-of-window matches', () => {
    const entries = [
      { id: 'a', homeTeamId: 'X', awayTeamId: 'Y', scheduledAt: '2026-11-07T09:00:00Z', court: 1 },
      { id: 'b', homeTeamId: 'P', awayTeamId: 'Q', scheduledAt: '2026-11-07T09:30:00Z', court: 1 },
      { id: 'c', homeTeamId: 'X', awayTeamId: 'Z', scheduledAt: '2026-11-07T09:30:00Z', court: 2 },
      { id: 'd', homeTeamId: 'Y', awayTeamId: 'W', scheduledAt: '2026-11-07T10:15:00Z', court: 2 },
      { id: 'e', homeTeamId: 'M', awayTeamId: 'N', scheduledAt: '2026-11-07T23:00:00Z', court: 1 },
    ];
    const types = findConflicts(entries, { ...base, windows: [day('2026-11-07', '08:00', '12:00')] }).map((c) => `${c.type}:${c.matchIds.join('')}`);
    expect(types).toEqual(expect.arrayContaining(['OUTSIDE_WINDOW:e', 'COURT_OVERLAP:ab', 'TEAM_OVERLAP:ac', 'TEAM_REST:ad']));
  });

  it('returns [] for a clean schedule and skips TBD teams', () => {
    const entries = [
      { id: 'a', homeTeamId: null, awayTeamId: null, scheduledAt: '2026-11-07T09:00:00Z', court: 1 },
      { id: 'b', homeTeamId: null, awayTeamId: null, scheduledAt: '2026-11-07T09:00:00Z', court: 2 },
    ];
    expect(findConflicts(entries, base)).toEqual([]);
  });
});
