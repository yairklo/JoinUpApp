/**
 * Unit tests for pick-session helpers (no DB / server boot required).
 */
const {
  parseTurnOrder,
  computeBench,
} = require('../services/pickSessionService');

describe('pickSessionService helpers', () => {
  test('parseTurnOrder handles arrays and JSON strings', () => {
    expect(parseTurnOrder(['a', 'b'])).toEqual(['a', 'b']);
    expect(parseTurnOrder('["x","y"]')).toEqual(['x', 'y']);
    expect(parseTurnOrder(null)).toEqual([]);
    expect(parseTurnOrder(undefined)).toEqual([]);
    expect(parseTurnOrder('not-json')).toEqual([]);
  });

  test('computeBench excludes assigned players and all managers', () => {
    const confirmed = [
      { userId: 'mgr1', teamId: null, user: { name: 'Manager One', imageUrl: null } },
      { userId: 'mgr2', teamId: 'team-b', user: { name: 'Manager Two', imageUrl: null } },
      { userId: 'p1', teamId: null, user: { name: 'Player One', imageUrl: 'a.png' } },
      { userId: 'p2', teamId: 'team-a', user: { name: 'Player Two', imageUrl: null } },
      { userId: 'p3', teamId: null, user: { name: 'Player Three', imageUrl: null } },
    ];
    const bench = computeBench(confirmed, ['mgr1', 'mgr2']);
    expect(bench.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(bench.find((p) => p.id === 'mgr1')).toBeUndefined();
    expect(bench.find((p) => p.id === 'p1')?.avatar).toBe('a.png');
  });

  test('computeBench returns empty when only managers remain unassigned', () => {
    const confirmed = [
      { userId: 'org', teamId: null, user: { name: 'Organizer' } },
      { userId: 'cap', teamId: null, user: { name: 'Captain' } },
    ];
    expect(computeBench(confirmed, ['org', 'cap'])).toEqual([]);
  });
});

describe('pick session API contract (route module loads)', () => {
  test('gamePickSession router exports', () => {
    const router = require('../routes/gamePickSession');
    expect(router).toBeTruthy();
    expect(typeof router).toBe('function');
  });
});
