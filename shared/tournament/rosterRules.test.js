const { validateLimits, validateRoster, canAddMember } = require('./rosterRules');

const rules = { minPlayers: 5, maxPlayers: 8, startersPerTeam: 5 };
const members = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, ...extra }));
const codes = (res) => res.errors.map((e) => e.code);

describe('validateLimits', () => {
  it('accepts sane limits and rejects inconsistent ones', () => {
    expect(validateLimits(rules)).toEqual([]);
    expect(validateLimits({ ...rules, minPlayers: 9 }).map((e) => e.code)).toEqual(['MIN_GREATER_THAN_MAX']);
    expect(validateLimits({ ...rules, startersPerTeam: 6 }).map((e) => e.code)).toEqual(['STARTERS_EXCEED_MIN']);
    expect(validateLimits({ minPlayers: 0, maxPlayers: 8, startersPerTeam: 1 }).map((e) => e.code)).toEqual(['INVALID_MIN_PLAYERS']);
    expect(validateLimits({}).length).toBe(3);
  });
});

describe('validateRoster', () => {
  it('passes a valid roster', () => {
    expect(validateRoster({ captainId: 'u1', members: members(6) }, rules)).toEqual({ valid: true, errors: [] });
  });

  it('enforces min and max (min can be relaxed while forming)', () => {
    expect(codes(validateRoster({ captainId: 'u1', members: members(4) }, rules))).toEqual(['TOO_FEW_PLAYERS']);
    expect(validateRoster({ captainId: 'u1', members: members(4) }, rules, { enforceMin: false }).valid).toBe(true);
    expect(codes(validateRoster({ captainId: 'u1', members: members(9) }, rules, { enforceMin: false }))).toEqual(['TOO_MANY_PLAYERS']);
  });

  it('requires a captain who is on the roster', () => {
    expect(codes(validateRoster({ members: members(6) }, rules))).toEqual(['NO_CAPTAIN']);
    expect(codes(validateRoster({ captainId: 'zzz', members: members(6) }, rules))).toEqual(['CAPTAIN_NOT_ON_ROSTER']);
    expect(validateRoster({ members: members(6) }, { ...rules, requireCaptain: false }).valid).toBe(true);
  });

  it('applies the minors flag', () => {
    const roster = { captainId: 'u1', members: [...members(5), { userId: 'kid', isMinor: true }] };
    expect(validateRoster(roster, rules).valid).toBe(true);
    const res = validateRoster(roster, { ...rules, allowMinors: false });
    expect(res.errors).toEqual([expect.objectContaining({ code: 'MINORS_NOT_ALLOWED', userId: 'kid' })]);
  });

  it('enforces one team per player but ignores the team itself', () => {
    const roster = { captainId: 'u1', members: members(5) };
    const res = validateRoster(roster, rules, { teamId: 't1', memberships: { u2: 't2', u3: 't1' } });
    expect(res.errors).toEqual([expect.objectContaining({ code: 'PLAYER_IN_OTHER_TEAM', userId: 'u2' })]);
  });

  it('detects duplicate players', () => {
    const res = validateRoster({ captainId: 'u1', members: [...members(5), { userId: 'u1' }] }, rules);
    expect(codes(res)).toEqual(['DUPLICATE_PLAYER']);
  });

  it('checks starters', () => {
    const withStarters = (n) => members(6).map((m, i) => ({ ...m, isStarter: i < n }));
    expect(validateRoster({ captainId: 'u1', members: withStarters(6) }, rules).errors.map((e) => e.code)).toEqual(['TOO_MANY_STARTERS']);
    expect(validateRoster({ captainId: 'u1', members: withStarters(3) }, rules).valid).toBe(true);
    expect(codes(validateRoster({ captainId: 'u1', members: withStarters(3) }, rules, { requireStarters: true }))).toEqual(['TOO_FEW_STARTERS']);
    expect(validateRoster({ captainId: 'u1', members: withStarters(5) }, rules, { requireStarters: true }).valid).toBe(true);
  });

  it('throws on invalid rules', () => {
    expect(() => validateRoster({ members: [] }, { minPlayers: 9, maxPlayers: 2, startersPerTeam: 1 })).toThrow(/invalid roster rules/);
  });

  it('reports several problems at once', () => {
    const res = validateRoster({ members: members(2, { isMinor: true }) }, { ...rules, allowMinors: false });
    expect(new Set(codes(res))).toEqual(new Set(['TOO_FEW_PLAYERS', 'NO_CAPTAIN', 'MINORS_NOT_ALLOWED']));
  });

  it('property: valid for every size between min and max, invalid just outside, for many limit combos', () => {
    for (let min = 1; min <= 12; min += 1) {
      for (let max = min; max <= 14; max += 1) {
        const r = { minPlayers: min, maxPlayers: max, startersPerTeam: Math.max(1, Math.min(min, 5)) };
        for (let n = 0; n <= max + 2; n += 1) {
          const res = validateRoster({ captainId: n ? 'u1' : null, members: members(n) }, { ...r, requireCaptain: n > 0 });
          expect(res.valid).toBe(n >= min && n <= max);
        }
      }
    }
  });
});

describe('canAddMember', () => {
  it('allows joining a forming team and blocks full teams, minors, and players on other teams', () => {
    const roster = { captainId: 'u1', members: members(2) };
    expect(canAddMember(roster, rules, { userId: 'new' }).valid).toBe(true);
    expect(canAddMember({ captainId: 'u1', members: members(8) }, rules, { userId: 'new' }).errors.map((e) => e.code)).toEqual(['TOO_MANY_PLAYERS']);
    expect(canAddMember(roster, { ...rules, allowMinors: false }, { userId: 'k', isMinor: true }).valid).toBe(false);
    expect(canAddMember(roster, rules, { userId: 'new' }, { teamId: 't1', memberships: { new: 't2' } }).valid).toBe(false);
    expect(canAddMember(roster, rules, { userId: 'u2' }).errors.map((e) => e.code)).toEqual(['DUPLICATE_PLAYER']);
  });
});
