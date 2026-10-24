const {
  summarizeEvening,
  suggestNextRound,
  appendEveningRound,
  toEveningResultBody,
  eveningFormErrors,
  initEveningForm,
} = require('./eveningSummary');

const teams = [
  { id: 'A', name: 'אדומים', playerIds: ['p1'] },
  { id: 'B', name: 'כחולים', playerIds: ['p2'] },
  { id: 'C', name: 'ירוקים', playerIds: ['p3'] },
];
const roster = [
  { userId: 'p1', teamId: 'A' },
  { userId: 'p2', teamId: 'B' },
  { userId: 'p3', teamId: 'C' },
];

describe('summarizeEvening fixed teams', () => {
  const rounds = [
    { sides: [{ teamId: 'A', label: 'אדומים', score: 2, players: [{ userId: 'p1', goals: 2 }] }, { teamId: 'B', label: 'כחולים', score: 1 }] },
    { sides: [{ teamId: 'A', label: 'אדומים', score: 0 }, { teamId: 'C', label: 'ירוקים', score: 1, players: [{ userId: 'p3', goals: 1 }] }] },
    { sides: [{ teamId: 'C', label: 'ירוקים', score: 1 }, { teamId: 'B', label: 'כחולים', score: 1 }] },
  ];

  test('team W/D/L and goals, and every roster player on a team that played', () => {
    const summary = summarizeEvening({ lineupMode: 'FIXED_TEAMS', rounds, roster });
    const byTeam = Object.fromEntries(summary.teams.map((t) => [t.teamId, t]));
    expect(byTeam.A).toMatchObject({ played: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 2 });
    expect(byTeam.B).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1, goalsFor: 2, goalsAgainst: 3 });
    expect(byTeam.C).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 2, goalsAgainst: 1 });

    const byPlayer = Object.fromEntries(summary.players.map((p) => [p.userId, p]));
    expect(byPlayer.p1).toMatchObject({ rounds: 2, wins: 1, losses: 1, goals: 2 });
    expect(byPlayer.p2).toMatchObject({ rounds: 2, wins: 0, draws: 1, losses: 1, goals: 0 });
    expect(byPlayer.p3).toMatchObject({ rounds: 2, wins: 1, draws: 1, losses: 0, goals: 1 });
  });
});

describe('summarizeEvening rotating lineups', () => {
  test('counts the players who were listed, not a team table', () => {
    const summary = summarizeEvening({
      lineupMode: 'ROTATING_LINEUPS',
      rounds: [
        {
          sides: [
            { label: 'א׳', score: 3, players: [{ userId: 'p1', goals: 2 }, { userId: 'p2', goals: 1 }] },
            { label: 'ב׳', score: 1, players: [{ userId: 'p3', goals: 1 }] },
          ],
        },
        {
          sides: [
            { label: 'א׳', score: 1, players: [{ userId: 'p1', goals: 1 }] },
            { label: 'ב׳', score: 2, players: [{ userId: 'p2', goals: 0 }, { userId: 'p3', goals: 2 }] },
          ],
        },
      ],
    });
    expect(summary.teams).toEqual([]);
    const byPlayer = Object.fromEntries(summary.players.map((p) => [p.userId, p]));
    expect(byPlayer.p1).toMatchObject({ wins: 1, losses: 1, goals: 3, rounds: 2 });
    expect(byPlayer.p2).toMatchObject({ wins: 2, losses: 0, goals: 1, rounds: 2 });
    expect(byPlayer.p3).toMatchObject({ wins: 1, losses: 1, goals: 3, rounds: 2 });
  });
});

describe('suggestNextRound winner stays', () => {
  const first = {
    sides: [
      { teamId: 'A', label: 'אדומים', score: 2 },
      { teamId: 'B', label: 'כחולים', score: 1 },
    ],
  };

  test('winner stays and the team that sat out comes on', () => {
    const next = suggestNextRound({ lineupMode: 'FIXED_TEAMS', rounds: [first], teams });
    expect(next.sides.map((s) => s.teamId)).toEqual(['A', 'C']);
    expect(next.sides.map((s) => s.label)).toEqual(['אדומים', 'ירוקים']);

    const after = suggestNextRound({
      lineupMode: 'FIXED_TEAMS',
      teams,
      rounds: [first, { sides: [{ teamId: 'A', label: 'אדומים', score: 0 }, { teamId: 'C', label: 'ירוקים', score: 3 }] }],
    });
    expect(after.sides.map((s) => s.teamId)).toEqual(['C', 'B']);
  });

  test('a draw keeps the challenger and brings on the team that sat out', () => {
    const next = suggestNextRound({
      lineupMode: 'FIXED_TEAMS',
      teams,
      rounds: [{ sides: [{ teamId: 'A', label: 'אדומים', score: 1 }, { teamId: 'B', label: 'כחולים', score: 1 }] }],
    });
    expect(next.sides.map((s) => s.teamId)).toEqual(['B', 'C']);
  });

  test('two teams play each other again', () => {
    const next = suggestNextRound({ lineupMode: 'FIXED_TEAMS', rounds: [first], teams: teams.slice(0, 2) });
    expect(next.sides.map((s) => s.teamId)).toEqual(['A', 'B']);
  });

  test('rotating copies the previous lineup and clears goals', () => {
    const next = suggestNextRound({
      lineupMode: 'ROTATING_LINEUPS',
      rounds: [{
        sides: [
          { label: 'א׳', score: 2, players: [{ userId: 'p1', goals: 2 }] },
          { label: 'ב׳', score: 0, players: [{ userId: 'p2', goals: 0 }] },
        ],
      }],
    });
    expect(next.sides[0].players).toEqual([{ userId: 'p1', goals: 0 }]);
    expect(next.sides[1].players).toEqual([{ userId: 'p2', goals: 0 }]);
    expect(next.sides[0].score).toBe(0);
  });
});

describe('evening form', () => {
  test('quick-add appends the suggested pairing and the save body lists scorers only in fixed mode', () => {
    const form = initEveningForm({ teams, roster });
    form.rounds[0].sides[0].score = 2;
    form.rounds[0].sides[1].score = 0;
    form.rounds[0].sides[0].goals = { p1: 2 };
    const next = appendEveningRound(form, teams);
    expect(next.rounds).toHaveLength(2);
    expect(next.rounds[1].sides.map((s) => s.teamId)).toEqual(['A', 'C']);
    const body = toEveningResultBody(next);
    expect(body.lineupMode).toBe('FIXED_TEAMS');
    expect(body.rounds[0].sides[0].players).toEqual([{ userId: 'p1', goals: 2 }]);
    expect(body.rounds[0].sides[1].players).toEqual([]);
    expect(eveningFormErrors(next)).toEqual([]);
  });

  test('rotating requires a player on each side and rejects someone on both', () => {
    const form = initEveningForm({ teams: [], roster });
    expect(form.lineupMode).toBe('ROTATING_LINEUPS');
    expect(eveningFormErrors(form).map((e) => e.code)).toContain('EMPTY_SIDE');
    form.rounds[0].sides[0].playerIds = ['p1'];
    form.rounds[0].sides[1].playerIds = ['p1'];
    expect(eveningFormErrors(form).map((e) => e.code)).toContain('DUPLICATE_PLAYER');
  });
});
