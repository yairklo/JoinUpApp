const { validateResultInput, validateRoundsInput } = require('../services/gameResultService');

const soccer = (extra = {}) => ({
  sides: [{ label: 'A', score: 2 }, { label: 'B', score: 1 }],
  ...extra,
});
const fails = (fn) => { try { fn(); } catch (e) { return e; } throw new Error('expected throw'); };

describe('validateResultInput: gap rules', () => {
  test('tennis score is sets won, computed from validated sets whatever the client sent', () => {
    const m = validateResultInput('TENNIS', {
      sides: [
        { label: 'A', score: 99, sets: [[6, 4], [3, 6], [10, 7]] },
        { label: 'B', score: 0, sets: [[0, 6]] },
      ],
    });
    expect(m.sides.map((s) => s.score)).toEqual([2, 1]);
    expect(m.sides.map((s) => s.outcome)).toEqual(['WIN', 'LOSS']);
    expect(m.sides[1].sets).toEqual([[4, 6], [6, 3], [7, 10]]);
  });

  test('tennis without valid sets is rejected even with a client score', () => {
    const e = fails(() => validateResultInput('TENNIS', { sides: [{ label: 'A', score: 2 }, { label: 'B', score: 0 }] }));
    expect(e.status).toBe(400);
    expect(e.code).toBe('INVALID_RESULT');
  });

  test('multiple MVPs: the last one wins and a warning is returned', () => {
    const m = validateResultInput('SOCCER', soccer({
      stats: [
        { userId: 'u1', sideOrder: 0, values: { goals: 1, mvp: 1 } },
        { userId: 'u2', sideOrder: 0, values: { mvp: 1 } },
        { userId: 'u3', sideOrder: 1, values: { mvp: 1 } },
      ],
    }));
    expect(m.stats.map((p) => p.values.mvp)).toEqual([undefined, undefined, 1]);
    expect(m.stats[0].values.goals).toBe(1);
    expect(m.warnings).toContainEqual({ code: 'MULTIPLE_MVP', keptUserId: 'u3', droppedUserIds: ['u1', 'u2'] });
  });

  test('a single MVP (or mvp: 0) produces no warning', () => {
    const m = validateResultInput('SOCCER', soccer({
      stats: [{ userId: 'u1', sideOrder: 0, values: { mvp: 1 } }, { userId: 'u2', sideOrder: 1, values: { mvp: 0 } }],
    }));
    expect(m.warnings.some((w) => w.code === 'MULTIPLE_MVP')).toBe(false);
    expect(m.stats[0].values.mvp).toBe(1);
  });

  test('two rounds without lineupMode are LINEUP_MODE_REQUIRED before any side check', () => {
    const twoRounds = {
      rounds: [
        { sides: [{ label: 'א', score: 1 }, { label: 'ב', score: 0 }] },
        { sides: [{ label: 'א', score: 2 }, { label: 'ב', score: 2 }] },
      ],
    };
    const missingMode = fails(() => validateRoundsInput('SOCCER', twoRounds));
    expect(missingMode).toMatchObject({ status: 400, code: 'LINEUP_MODE_REQUIRED' });

    // Sides are also invalid. Mode is checked first, so this is not INVALID_SIDES.
    const missingSides = fails(() => validateRoundsInput('SOCCER', { rounds: [{}, {}] }));
    expect(missingSides).toMatchObject({ status: 400, code: 'LINEUP_MODE_REQUIRED' });

    const badMode = fails(() => validateRoundsInput('SOCCER', { ...twoRounds, lineupMode: 'PICKUP' }));
    expect(badMode).toMatchObject({ status: 400, code: 'LINEUP_MODE_REQUIRED' });

    const badSides = fails(() => validateRoundsInput('SOCCER', {
      lineupMode: 'FIXED_TEAMS',
      rounds: [{ sides: [{ label: 'א', score: 1 }] }, { sides: [{ label: 'א', score: 1 }, { label: 'ב', score: 0 }] }],
    }));
    expect(badSides).toMatchObject({ status: 400, code: 'INVALID_SIDES' });

    const single = validateRoundsInput('SOCCER', {
      rounds: [{ sides: [{ label: 'א', score: 1 }, { label: 'ב', score: 0 }] }],
    });
    expect(single.lineupMode).toBeNull();
    expect(single.rounds).toHaveLength(1);
  });

  test('notes: 500 chars ok, 501 rejected with NOTES_TOO_LONG, whitespace trimmed first', () => {
    expect(validateResultInput('SOCCER', soccer({ notes: `  ${'x'.repeat(500)}  ` })).notes).toHaveLength(500);
    expect(validateResultInput('SOCCER', soccer({ notes: '   ' })).notes).toBeNull();
    const e = fails(() => validateResultInput('SOCCER', soccer({ notes: 'x'.repeat(501) })));
    expect(e).toMatchObject({ status: 400, code: 'NOTES_TOO_LONG', message: 'Notes must be at most 500 characters' });
    expect(e.details).toEqual([{ max: 500, length: 501 }]);
  });
});
