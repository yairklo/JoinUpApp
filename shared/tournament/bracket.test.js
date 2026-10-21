const {
  nextPowerOfTwo, seedOrder, roundName, groupRankSeeds, generateBracket, advance, resolveGroupRanks, getRounds,
} = require('./bracket');

const ids = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

/** Play the whole bracket: the lower seed number always wins. Returns the final matches. */
function playOut(bracket) {
  const seedOf = (id) => bracket.seeds.indexOf(id);
  let matches = bracket.matches;
  for (let r = 1; r <= bracket.roundCount; r += 1) {
    matches.filter((m) => m.round === r && m.status !== 'BYE').forEach((m) => {
      const cur = matches.find((x) => x.id === m.id);
      const winner = seedOf(cur.home.teamId) < seedOf(cur.away.teamId) ? cur.home.teamId : cur.away.teamId;
      matches = advance(matches, m.id, winner).matches;
    });
  }
  return matches;
}

describe('helpers', () => {
  it('nextPowerOfTwo / seedOrder / roundName', () => {
    expect([1, 2, 3, 5, 8, 9, 17, 32].map(nextPowerOfTwo)).toEqual([1, 2, 4, 8, 8, 16, 32, 32]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect([1, 2, 3, 4].map((r) => roundName(r, 4))).toEqual(['ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL']);
  });
});

describe('generateBracket', () => {
  it('rejects fewer than two entries, bad seeding and duplicates', () => {
    expect(() => generateBracket(['A'])).toThrow();
    expect(() => generateBracket(['A', 'B'], { seeding: 'X' })).toThrow();
    expect(() => generateBracket(['A', 'A'])).toThrow();
  });

  it('property N=2..32: size is next power of two, byes go to top seeds, every team appears once in round 1/2 feed', () => {
    for (let n = 2; n <= 32; n += 1) {
      const b = generateBracket(ids(n));
      const size = nextPowerOfTwo(n);
      expect(b.size).toBe(size);
      expect(b.roundCount).toBe(Math.log2(size));
      expect(b.matches.filter((m) => !m.isThirdPlace)).toHaveLength(size - 1);
      const r1 = b.matches.filter((m) => m.round === 1);
      const byeMatches = r1.filter((m) => m.status === 'BYE');
      expect(byeMatches).toHaveLength(size - n);
      // The teams with byes are exactly seeds 1..(size-n).
      expect(byeMatches.map((m) => m.winnerId).sort()).toEqual(ids(size - n).sort());
      // Every team is placed exactly once in round 1.
      const placed = r1.flatMap((m) => [m.home.teamId, m.away.teamId]).filter(Boolean);
      expect(placed.sort()).toEqual(ids(n).sort());
      // Bye winners already sit in round 2.
      if (b.roundCount >= 2) {
        const r2 = b.matches.filter((m) => m.round === 2).flatMap((m) => [m.home.teamId, m.away.teamId]);
        byeMatches.forEach((m) => expect(r2).toContain(m.winnerId));
      }
    }
  });

  it('property: playing every match yields the top seed as champion and consistent advancement', () => {
    for (let n = 2; n <= 32; n += 1) {
      const b = generateBracket(ids(n));
      const done = playOut(b);
      const final = done.find((m) => m.round === b.roundCount && !m.isThirdPlace);
      expect(final.winnerId).toBe('T1');
      expect(done.every((m) => m.status !== 'SCHEDULED')).toBe(true);
      // Each team plays at most roundCount matches; the champion plays all non-bye rounds.
      const games = (t) => done.filter((m) => m.status === 'FINISHED' && (m.home.teamId === t || m.away.teamId === t)).length;
      ids(n).forEach((t) => expect(games(t)).toBeLessThanOrEqual(b.roundCount));
    }
  });

  it('standard pairing keeps seeds 1 and 2 apart until the final', () => {
    const b = generateBracket(ids(8));
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1.map((m) => [m.home.teamId, m.away.teamId])).toEqual([['T1', 'T8'], ['T4', 'T5'], ['T2', 'T7'], ['T3', 'T6']]);
  });

  it('RANDOM seeding is deterministic per seed', () => {
    const a = generateBracket(ids(10), { seeding: 'RANDOM', seed: 11 });
    expect(generateBracket(ids(10), { seeding: 'RANDOM', seed: 11 })).toEqual(a);
    expect(generateBracket(ids(10), { seeding: 'RANDOM', seed: 12 }).seeds).not.toEqual(a.seeds);
    expect([...a.seeds].sort()).toEqual(ids(10).sort());
  });

  it('adds a third-place match fed by semifinal losers, only when both semis are real', () => {
    const b = generateBracket(ids(8), { thirdPlace: true });
    const tp = b.matches.find((m) => m.isThirdPlace);
    expect(tp.home.source).toEqual({ type: 'LOSER_OF', matchId: 'R2M1' });
    expect(tp.away.source).toEqual({ type: 'LOSER_OF', matchId: 'R2M2' });
    const done = playOut(b);
    const tpDone = done.find((m) => m.isThirdPlace);
    expect(tpDone.home.teamId).not.toBeNull();
    expect(tpDone.away.teamId).not.toBeNull();
    expect(generateBracket(ids(3), { thirdPlace: true }).matches.some((m) => m.isThirdPlace)).toBe(false);
    expect(generateBracket(ids(2), { thirdPlace: true }).matches.some((m) => m.isThirdPlace)).toBe(false);
    expect(generateBracket(ids(4), { thirdPlace: true }).matches.some((m) => m.isThirdPlace)).toBe(true);
  });
});

describe('advance', () => {
  it('sets winner/loser and fills WINNER_OF slots', () => {
    const b = generateBracket(ids(4));
    const { matches, changed } = advance(b.matches, 'R1M1', 'T4');
    expect(changed).toEqual(['R1M1', 'R2M1']);
    expect(matches.find((m) => m.id === 'R1M1')).toMatchObject({ winnerId: 'T4', loserId: 'T1', status: 'FINISHED' });
    expect(matches.find((m) => m.id === 'R2M1').home).toEqual({ teamId: 'T4', source: { type: 'WINNER_OF', matchId: 'R1M1' } });
    expect(b.matches.find((m) => m.id === 'R1M1').winnerId).toBeNull(); // input untouched
  });

  it('validates input and supports correcting a result until downstream is played', () => {
    const b = generateBracket(ids(4));
    expect(() => advance(b.matches, 'nope', 'T1')).toThrow();
    expect(() => advance(b.matches, 'R1M1', 'T2')).toThrow();
    expect(() => advance(b.matches, 'R2M1', 'T1')).toThrow(); // teams unknown yet
    let { matches } = advance(b.matches, 'R1M1', 'T1');
    ({ matches } = advance(matches, 'R1M1', 'T4')); // correction
    expect(matches.find((m) => m.id === 'R2M1').home.teamId).toBe('T4');
    ({ matches } = advance(matches, 'R1M1', null)); // undo
    expect(matches.find((m) => m.id === 'R2M1').home.teamId).toBeNull();
    ({ matches } = advance(matches, 'R1M1', 'T1'));
    ({ matches } = advance(matches, 'R1M2', 'T2'));
    ({ matches } = advance(matches, 'R2M1', 'T1'));
    expect(() => advance(matches, 'R1M1', 'T4')).toThrow(/already played/);
  });

  it('refuses results on byes', () => {
    const b = generateBracket(ids(3));
    expect(() => advance(b.matches, 'R1M1', 'T1')).toThrow(/bye/);
  });
});

describe('group-rank seeding', () => {
  it('produces placeholders, keeps group-mates apart in round one, and resolves them later', () => {
    const entries = groupRankSeeds(['A', 'B', 'C', 'D'], 2);
    expect(entries).toHaveLength(8);
    const b = generateBracket(entries);
    b.matches.filter((m) => m.round === 1).forEach((m) => {
      expect(m.home.source.groupId).not.toBe(m.away.source.groupId);
      expect(m.home.teamId).toBeNull();
    });
    const rankings = { A: ['a1', 'a2'], B: ['b1', 'b2'], C: ['c1', 'c2'], D: ['d1', 'd2'] };
    const resolved = resolveGroupRanks(b.matches, rankings);
    const r1 = resolved.filter((m) => m.round === 1);
    expect(r1.flatMap((m) => [m.home.teamId, m.away.teamId]).sort()).toEqual(Object.values(rankings).flat().sort());
    expect(r1[0].home.source).toEqual({ type: 'GROUP_RANK', groupId: 'A', rank: 1 });
  });

  it('carries resolved teams through byes (3 groups, top 1 = 3 entries)', () => {
    const b = generateBracket(groupRankSeeds(['A', 'B', 'C'], 1));
    expect(b.size).toBe(4);
    const resolved = resolveGroupRanks(b.matches, { A: ['a1'], B: ['b1'], C: ['c1'] });
    const bye = resolved.find((m) => m.status === 'BYE');
    expect(bye.winnerId).toBe('a1');
    expect(resolved.find((m) => m.id === 'R2M1').home.teamId).toBe('a1');
  });
});

describe('getRounds', () => {
  it('groups matches by round with names', () => {
    const rounds = getRounds(generateBracket(ids(8), { thirdPlace: true }));
    expect(rounds.map((r) => r.name)).toEqual(['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL']);
    expect(rounds[2].matches.map((m) => m.id).sort()).toEqual(['R3M1', 'TP']);
  });
});
