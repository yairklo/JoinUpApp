/**
 * Unit tests for pick-session helpers (no DB / server boot required).
 */
const {
  parseTurnOrder,
} = require('../services/pickSessionService');

describe('pickSessionService helpers', () => {
  test('parseTurnOrder handles arrays and JSON strings', () => {
    expect(parseTurnOrder(['a', 'b'])).toEqual(['a', 'b']);
    expect(parseTurnOrder('["x","y"]')).toEqual(['x', 'y']);
    expect(parseTurnOrder(null)).toEqual([]);
    expect(parseTurnOrder(undefined)).toEqual([]);
    expect(parseTurnOrder('not-json')).toEqual([]);
  });
});

describe('pick session API contract (route module loads)', () => {
  test('gamePickSession router exports', () => {
    const router = require('../routes/gamePickSession');
    expect(router).toBeTruthy();
    expect(typeof router).toBe('function');
  });
});
