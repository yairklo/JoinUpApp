const jestMock = require('jest');

jest.setTimeout(60000);

jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { prisma, ensureUsers, tournamentBody, cleanup, seedTeams } = require('./helpers/tournamentFixtures');
const tournamentService = require('../services/tournamentService');
const teamService = require('../services/tournamentTeamService');
const resultService = require('../services/tournamentResultService');
const scheduleService = require('../services/tournamentScheduleService');

const P = 'tsdir_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const CAP1 = `${P}cap1`;
const CAP2 = `${P}cap2`;
const USER_EXTRA = `${P}extra`;

describe('Direct tournament services tests', () => {
  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    await ensureUsers([ORG, MGR, CAP1, CAP2, USER_EXTRA]);
  });

  afterAll(async () => {
    await cleanup(P);
    await prisma.$disconnect();
  });

  describe('1. Standings with forfeit (rankTable / computeStandings)', () => {
    const t = {
      id: 't_forfeit',
      rules: {
        points: { win: 3, draw: 1, loss: 0 },
        tiebreak: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
        forfeitScore: { winner: 3, loser: 0 },
      },
    };
    const teams = [
      { id: 'teamA', manualRank: null, status: 'APPROVED' },
      { id: 'teamB', manualRank: null, status: 'APPROVED' },
    ];

    it('awards 3 points and forfeitScore (3-0) to the non-forfeiting team', () => {
      // teamA forfeits to teamB
      const matches = [
        {
          id: 'm1',
          homeTeamId: 'teamA',
          awayTeamId: 'teamB',
          homeScore: 0,
          awayScore: 3,
          status: 'FORFEIT',
          winnerTeamId: 'teamB',
        },
      ];

      const standings = resultService.rankTable(t, teams, matches);
      expect(standings).toHaveLength(2);

      const winner = standings.find((r) => r.teamId === 'teamB');
      const forfeiter = standings.find((r) => r.teamId === 'teamA');

      expect(winner.points).toBe(3);
      expect(winner.won).toBe(1);
      expect(winner.gf).toBe(3);
      expect(winner.ga).toBe(0);
      expect(winner.gd).toBe(3);
      expect(winner.rank).toBe(1);

      expect(forfeiter.points).toBe(0);
      expect(forfeiter.lost).toBe(1);
      expect(forfeiter.gf).toBe(0);
      expect(forfeiter.ga).toBe(3);
      expect(forfeiter.gd).toBe(-3);
      expect(forfeiter.rank).toBe(2);
    });
  });

  describe('2. Withdraw after results', () => {
    let tournament;
    let teams;

    beforeAll(async () => {
      tournament = await tournamentService.createTournament(
        { id: ORG },
        tournamentBody({ maxTeams: 4, minTeams: 2, maxPlayersPerTeam: 3 })
      );
      await tournamentService.setRole({ id: ORG }, tournament.id, MGR, 'MANAGER');
      teams = await seedTeams(P, tournament.id, 3, 2);

      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'REGISTRATION_CLOSED' },
      });
      await scheduleService.generateSchedule({ id: MGR }, tournament.id, {}, { preview: false });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('preserves completed results and forfeits remaining matches when team withdraws', async () => {
      const scheduledMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { number: 'asc' },
      });
      expect(scheduledMatches.length).toBeGreaterThan(0);

      // Play match 1: Team 1 beats Team 2 (2 - 1)
      const m1 = scheduledMatches[0];
      await resultService.putResult({ id: MGR }, tournament.id, m1.id, {
        expectedVersion: m1.version,
        status: 'FINISHED',
        homeScore: 2,
        awayScore: 1,
      });

      // Now Team 2 withdraws
      const team2 = teams[1];
      const withdrawRes = await teamService.withdrawTeam({ id: MGR }, tournament.id, team2.id);
      expect(withdrawRes.ok).toBe(true);

      // Verify Team 2 status is WITHDRAWN
      const updatedTeam2 = await prisma.tournamentTeam.findUnique({ where: { id: team2.id } });
      expect(updatedTeam2.status).toBe('WITHDRAWN');

      // First match remains FINISHED
      const refetchedM1 = await prisma.tournamentMatch.findUnique({ where: { id: m1.id } });
      expect(refetchedM1.status).toBe('FINISHED');
      expect(refetchedM1.homeScore).toBe(2);
      expect(refetchedM1.awayScore).toBe(1);

      // Future matches involving Team 2 are now FORFEIT
      const mTeam2Remaining = await prisma.tournamentMatch.findMany({
        where: {
          tournamentId: tournament.id,
          id: { not: m1.id },
          OR: [{ homeTeamId: team2.id }, { awayTeamId: team2.id }],
        },
      });
      for (const m of mTeam2Remaining) {
        expect(m.status).toBe('FORFEIT');
      }

      // Check standings: Team 2 is marked withdrawn in the table
      const standings = await resultService.getStandings({ id: MGR }, tournament.id);
      const rowTeam2 = standings.tables[0].rows.find((r) => r.team.id === team2.id);
      expect(rowTeam2).toBeDefined();
      expect(rowTeam2.withdrawn).toBe(true);
    });
  });

  describe('3. Technical loss on a live match', () => {
    let tournament;
    let match;

    beforeAll(async () => {
      tournament = await tournamentService.createTournament(
        { id: ORG },
        tournamentBody({ maxTeams: 2, minTeams: 2 })
      );
      await tournamentService.setRole({ id: ORG }, tournament.id, MGR, 'SCOREKEEPER');
      const seeded = await seedTeams(`${P}live_`, tournament.id, 2, 2);

      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'REGISTRATION_CLOSED' },
      });
      await scheduleService.generateSchedule({ id: ORG }, tournament.id, {}, { preview: false });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'IN_PROGRESS' },
      });

      match = await prisma.tournamentMatch.findFirst({
        where: { tournamentId: tournament.id },
      });

      // Put match into LIVE state
      const liveRes = await resultService.putResult({ id: MGR }, tournament.id, match.id, {
        expectedVersion: match.version,
        status: 'LIVE',
        homeScore: 1,
        awayScore: 0,
      });
      expect(liveRes.match.status).toBe('LIVE');
      match = liveRes.match;
    });

    it('transitions a LIVE match to FORFEIT technical loss with correct winner and scores', async () => {
      const forfeitRes = await resultService.putResult({ id: MGR }, tournament.id, match.id, {
        expectedVersion: match.version,
        status: 'FORFEIT',
        forfeitBy: match.home.teamId,
      });

      expect(forfeitRes.match.status).toBe('FORFEIT');
      expect(forfeitRes.match.winnerTeamId).toBe(match.away.teamId);
      expect(forfeitRes.match.homeScore).toBe(0);
      expect(forfeitRes.match.awayScore).toBe(3);
    });
  });

  describe('4. manualRank overrides and tie resolution', () => {
    const t = { id: 't_rank', rules: { tiebreak: ['GOAL_DIFFERENCE', 'GOALS_FOR'] } };
    const team = (id, manualRank = null) => ({ id, manualRank, status: 'APPROVED' });

    it('pins team at requested rank and clears unresolved tie', () => {
      // Drawn match => both teams tied
      const drawn = [
        {
          id: 'md',
          homeTeamId: 'team1',
          awayTeamId: 'team2',
          homeScore: 1,
          awayScore: 1,
          status: 'FINISHED',
          winnerTeamId: null,
        },
      ];

      // Without pin: tied and unresolved
      const unpinned = resultService.rankTable(t, [team('team1'), team('team2')], drawn);
      expect(unpinned[0].tied).toBe(true);
      expect(unpinned[0].unresolved).toBe(true);

      // Pin team2 at rank 1
      const pinned = resultService.rankTable(t, [team('team1'), team('team2', 1)], drawn);
      expect(pinned[0].teamId).toBe('team2');
      expect(pinned[0].rank).toBe(1);
      expect(pinned[0].unresolved).toBe(false);

      expect(pinned[1].teamId).toBe('team1');
      expect(pinned[1].rank).toBe(2);
    });

    it('clamps manualRank exceeding team count to last position', () => {
      const matches = [];
      const rows = resultService.rankTable(
        t,
        [team('tA', 99), team('tB'), team('tC')],
        matches
      );
      expect(rows[rows.length - 1].teamId).toBe('tA');
      expect(rows[rows.length - 1].rank).toBe(3);
    });
  });

  describe('5. Roster capacity limits (maxPlayersPerTeam)', () => {
    let tournament;
    let teamRow;

    beforeAll(async () => {
      // maxPlayersPerTeam: 2
      tournament = await tournamentService.createTournament(
        { id: ORG },
        tournamentBody({ maxTeams: 4, minTeams: 2, startersPerTeam: 1, minPlayersPerTeam: 1, maxPlayersPerTeam: 2 })
      );
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: 'REGISTRATION_OPEN' },
      });

      // Create a team with 1 captain
      const created = await teamService.createTeam({ id: CAP1 }, tournament.id, { name: 'Cap Team' });
      teamRow = created.team;
    });

    it('allows adding player when under maxPlayersPerTeam', async () => {
      // Team has 1 member (captain), max is 2 => adding 1 player succeeds
      const invite = await teamService.inviteMember(
        { id: CAP1 },
        tournament.id,
        teamRow.id,
        CAP2
      );
      expect(invite.member.userId).toBe(CAP2);
      expect(invite.member.status).toBe('INVITED');
    });

    it('rejects adding player with TOO_MANY_PLAYERS when capacity is reached', async () => {
      // Team now has 2 members (1 ACCEPTED captain + 1 INVITED player) => full!
      await expect(
        teamService.inviteMember({ id: CAP1 }, tournament.id, teamRow.id, USER_EXTRA)
      ).rejects.toMatchObject({
        status: 409,
        code: 'TOO_MANY_PLAYERS',
      });
    });
  });
});
