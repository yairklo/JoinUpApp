const { buildManageItems, describeStart, MANAGE_HOME_LIMIT } = require('./manage');

const game = (id, start) => ({ id, start, role: 'ORGANIZER' });
const group = (id, nextStart) => ({ id, nextGame: nextStart ? game(`${id}-g`, nextStart) : null });

describe('buildManageItems', () => {
  it('returns [] without an overview', () => {
    expect(buildManageItems(null)).toEqual([]);
  });

  it('orders groups and games by the next game, with groups lacking one last', () => {
    const items = buildManageItems({
      groups: [group('empty1', null), group('late', '2026-12-10T18:00:00Z'), group('empty2', null)],
      games: [game('mid', '2026-12-05T18:00:00Z'), game('soon', '2026-12-01T18:00:00Z')],
      attention: [],
    });
    expect(items.map((i) => i.key)).toEqual(['m-soon', 'm-mid', 'g-late', 'g-empty1', 'g-empty2']);
  });

  it('exposes a sensible home limit', () => {
    expect(MANAGE_HOME_LIMIT).toBeGreaterThan(0);
  });
});

describe('describeStart', () => {
  const now = new Date('2026-12-01T10:00:00Z'); // Tuesday, 12:00 in Jerusalem

  it('flags today and tomorrow in Jerusalem time', () => {
    expect(describeStart('2026-12-01T18:00:00Z', now)).toMatchObject({ kind: 'today', time: '20:00' });
    expect(describeStart('2026-12-02T18:00:00Z', now)).toMatchObject({ kind: 'tomorrow', time: '20:00' });
  });

  it('gives the weekday and date for later games', () => {
    expect(describeStart('2026-12-05T18:00:00Z', now)).toEqual({
      kind: 'weekday', dayOfWeek: 6, day: 5, month: 12, time: '20:00',
    });
  });

  it('uses the Jerusalem date for a late-evening start', () => {
    // 22:30Z is already the next day in Jerusalem (UTC+2).
    expect(describeStart('2026-12-01T22:30:00Z', now)).toMatchObject({ kind: 'tomorrow', time: '00:30' });
  });

  it('returns null for garbage', () => {
    expect(describeStart('nope', now)).toBeNull();
  });
});
