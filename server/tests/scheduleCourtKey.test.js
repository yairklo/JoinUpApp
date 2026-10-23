// Pure test (no DB): the vendored scheduler treats "1" and "מגרש 1" as the same court.
const { courtKey, findConflicts, scheduleMatches } = require('../shared/tournament/scheduler');

const cfg = { windows: [{ start: '2026-11-07T08:00:00Z', end: '2026-11-07T12:00:00Z' }], matchMinutes: 60 };

describe('court key canonicalisation', () => {
  it('maps bare digits and "מגרש N" to one key; other names compare trimmed, case-insensitive', () => {
    expect(courtKey('1')).toBe(courtKey('מגרש 1'));
    expect(courtKey(' מגרש  01 ')).toBe(courtKey(1));
    expect(courtKey('1')).not.toBe(courtKey('מגרש 2'));
    expect(courtKey(' Center ')).toBe(courtKey('center'));
  });

  it('flags COURT_OVERLAP between a match on "1" and one on "מגרש 1"', () => {
    const entries = [
      { id: 'a', homeTeamId: 'A', awayTeamId: 'B', scheduledAt: '2026-11-07T09:00:00Z', court: '1' },
      { id: 'b', homeTeamId: 'C', awayTeamId: 'D', scheduledAt: '2026-11-07T09:00:00Z', court: 'מגרש 1' },
    ];
    expect(findConflicts(entries, cfg).map((c) => c.type)).toContain('COURT_OVERLAP');
  });

  it('does not flag different courts', () => {
    const entries = [
      { id: 'a', homeTeamId: 'A', awayTeamId: 'B', scheduledAt: '2026-11-07T09:00:00Z', court: '1' },
      { id: 'b', homeTeamId: 'C', awayTeamId: 'D', scheduledAt: '2026-11-07T09:00:00Z', court: 'מגרש 2' },
    ];
    expect(findConflicts(entries, cfg)).toEqual([]);
  });

  it('keeps new matches off a court occupied under the other label', () => {
    const r = scheduleMatches(
      [{ id: 'n', homeTeamId: 'C', awayTeamId: 'D' }],
      { ...cfg, courts: ['מגרש 1'], existing: [{ id: 'x', homeTeamId: 'A', awayTeamId: 'B', scheduledAt: '2026-11-07T08:00:00Z', court: '1' }] }
    );
    expect(r.scheduled[0].scheduledAt).not.toBe('2026-11-07T08:00:00.000Z');
  });
});
