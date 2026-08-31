import { normalizeIncomingGame, formatJerusalemDate, formatJerusalemTime } from './timezone';

describe('normalizeIncomingGame', () => {
  test('derives date and time from the start instant', () => {
    const result = normalizeIncomingGame({ id: 'g1', start: '2026-08-31T21:30:00Z' });
    expect(result.date).toEqual(formatJerusalemDate('2026-08-31T21:30:00Z'));
    expect(result.time).toEqual(formatJerusalemTime('2026-08-31T21:30:00Z'));
    expect(result.id).toEqual('g1');
  });

  test('passes through a payload with no start field unchanged', () => {
    const payload = { id: 'g2' };
    expect(normalizeIncomingGame(payload as any)).toBe(payload);
  });

  test('falls back to the original payload if formatting throws', () => {
    const payload = { start: 'not-a-real-date' };
    const result = normalizeIncomingGame(payload);
    // formatJerusalemDate/Time return '' for invalid dates rather than throwing,
    // so the payload should still come back with empty date/time fields set.
    expect(result.date).toEqual('');
    expect(result.time).toEqual('');
  });
});
