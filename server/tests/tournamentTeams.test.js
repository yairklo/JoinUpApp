const request = require('supertest');

jest.setTimeout(120000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/gameReminderWorker', () => ({
  startGameReminderWorker: jest.fn().mockResolvedValue(undefined),
  checkUpcomingGames: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { prisma, ensureUsers, tournamentBody, cleanup } = require('./helpers/tournamentFixtures');

const P = 'tteam_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const u = (n) => `${P}u${n}`;
const MINOR = `${P}minor`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);
const adultBirth = new Date('1990-01-01');
const minorBirth = new Date(Date.now() - 12 * 365 * 864e5);

async function newTournament(over = {}, { open = true } = {}) {
  const res = await as('post', '/api/tournaments', ORG).send(tournamentBody(over));
  expect(res.status).toBe(201);
  const id = res.body.id;
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: MGR, role: 'MANAGER' });
  if (open) await as('post', `/api/tournaments/${id}/status`, ORG).send({ status: 'REGISTRATION_OPEN' });
  return id;
}
const mkTeam = (tid, user, name) => as('post', `/api/tournaments/${tid}/teams`, user).send({ name: name || `Team ${user}` });
const invite = (tid, teamId, by, target) => as('post', `/api/tournaments/${tid}/teams/${teamId}/members`, by).send({ userId: target });
const respond = (tid, teamId, user, accept) => as('post', `/api/tournaments/${tid}/teams/${teamId}/members/${user}/respond`, user).send({ accept });

describe('tournament teams & roster', () => {
  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    const ids = [ORG, MGR, ...Array.from({ length: 12 }, (_, i) => u(i + 1))];
    await ensureUsers(ids, Object.fromEntries(ids.map((id) => [id, { birthDate: adultBirth }])));
    await ensureUsers([MINOR], { [MINOR]: { birthDate: minorBirth } });
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('creates a team: captain ACCEPTED, status per requireApproval, chat access', async () => {
    const tid = await newTournament();
    const res = await mkTeam(tid, u(1), 'Reds');
    expect(res.status).toBe(201);
    expect(res.body.team.status).toBe('PENDING');
    expect(res.body.team.joinCode).toBeTruthy();
    expect(res.body.team.members).toEqual([expect.objectContaining({ userId: u(1), role: 'CAPTAIN', status: 'ACCEPTED' })]);
    expect((await prisma.chatParticipant.findFirst({ where: { chatId: tid, userId: u(1) } }))).toBeTruthy();
    expect((await mkTeam(tid, u(2), 'Reds')).body.code).toBe('NAME_TAKEN');
    const auto = await newTournament({ requireApproval: false });
    expect((await mkTeam(auto, u(3))).body.team.status).toBe('APPROVED');
  });

  it('requires open registration (draft hidden, closed 409)', async () => {
    const draft = await newTournament({}, { open: false });
    expect((await mkTeam(draft, u(1))).status).toBe(404);
    const tid = await newTournament({ registrationClosesAt: new Date(Date.now() - 1000).toISOString(), registrationOpensAt: new Date(Date.now() - 5000).toISOString() });
    const r = await mkTeam(tid, u(1));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('REGISTRATION_CLOSED');
  });

  it('two captains racing for the last spot: one held, one WAITLISTED', async () => {
    const tid = await newTournament({ maxTeams: 2, minTeams: 2 });
    expect((await mkTeam(tid, u(1))).status).toBe(201); // one spot left
    const [a, b] = await Promise.all([mkTeam(tid, u(2)), mkTeam(tid, u(3))]);
    const statuses = [a.body.team.status, b.body.team.status].sort();
    expect(statuses).toEqual(['PENDING', 'WAITLISTED']);
    const held = await prisma.tournamentTeam.count({ where: { tournamentId: tid, status: { in: ['PENDING', 'APPROVED'] } } });
    expect(held).toBe(2);
  });

  it('a player cannot captain/join two teams (409), but may hold several invitations', async () => {
    const tid = await newTournament();
    const t1 = (await mkTeam(tid, u(1), 'A')).body.team;
    const t2 = (await mkTeam(tid, u(2), 'B')).body.team;
    expect((await mkTeam(tid, u(1), 'C')).body.code).toBe('PLAYER_IN_OTHER_TEAM');
    // u4 is invited by both teams
    expect((await invite(tid, t1.id, u(1), u(4))).status).toBe(201);
    expect((await invite(tid, t2.id, u(2), u(4))).status).toBe(201);
    expect((await invite(tid, t1.id, u(1), u(4))).status).toBe(200); // idempotent
    expect((await as('get', '/api/tournaments/my-invites', u(4))).body.map((i) => i.teamId).sort()).toEqual([t1.id, t2.id].sort());
    // accepts one: the other pending invite is voided
    expect((await respond(tid, t1.id, u(4), true)).body.accepted).toBe(true);
    expect((await respond(tid, t2.id, u(4), true)).status).toBe(404);
    expect(await prisma.tournamentTeamMember.count({ where: { tournamentId: tid, userId: u(4) } })).toBe(1);
    // already ACCEPTED: another invite or join code -> 409
    expect((await invite(tid, t2.id, u(2), u(4))).body.code).toBe('PLAYER_IN_OTHER_TEAM');
    const t2full = (await as('get', `/api/tournaments/${tid}/teams/${t2.id}`, u(2))).body;
    expect((await as('post', `/api/tournaments/${tid}/join/${t2full.joinCode}`, u(4))).body.code).toBe('PLAYER_IN_OTHER_TEAM');
  });

  it('invitee only responds for themselves; decline then join elsewhere works', async () => {
    const tid = await newTournament();
    const t1 = (await mkTeam(tid, u(1), 'A')).body.team;
    const t2 = (await mkTeam(tid, u(2), 'B')).body.team;
    await invite(tid, t1.id, u(1), u(5));
    expect((await as('post', `/api/tournaments/${tid}/teams/${t1.id}/members/${u(5)}/respond`, u(6)).send({ accept: true })).status).toBe(403);
    expect((await respond(tid, t1.id, u(5), false)).body.accepted).toBe(false);
    const code = (await as('get', `/api/tournaments/${tid}/teams/${t2.id}`, u(2))).body.joinCode;
    expect((await as('post', `/api/tournaments/${tid}/join/${code}`, u(5))).status).toBe(200);
    expect((await invite(tid, t1.id, u(3), u(7))).status).toBe(403); // not captain
  });

  it('roster max: cannot invite or join beyond maxPlayersPerTeam', async () => {
    const tid = await newTournament({ maxPlayersPerTeam: 2, minPlayersPerTeam: 2, startersPerTeam: 2 });
    const team = (await mkTeam(tid, u(1))).body.team;
    expect((await invite(tid, team.id, u(1), u(2))).status).toBe(201);
    const over = await invite(tid, team.id, u(1), u(3));
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('TOO_MANY_PLAYERS');
    const joined = await as('post', `/api/tournaments/${tid}/join/${team.joinCode}`, u(3));
    expect(joined.body.code).toBe('TOO_MANY_PLAYERS');
  });

  it('concurrent joins by code never exceed the roster max', async () => {
    const tid = await newTournament({ maxPlayersPerTeam: 3, minPlayersPerTeam: 2, startersPerTeam: 2 });
    const team = (await mkTeam(tid, u(1))).body.team;
    const results = await Promise.all([2, 3, 4, 5].map((n) => as('post', `/api/tournaments/${tid}/join/${team.joinCode}`, u(n))));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(await prisma.tournamentTeamMember.count({ where: { teamId: team.id, status: 'ACCEPTED' } })).toBe(3);
  });

  it('approval needs the minimum roster; manager decides; waitlist promotes on reject', async () => {
    const tid = await newTournament({ maxTeams: 2, minPlayersPerTeam: 2 });
    const a = (await mkTeam(tid, u(1), 'A')).body.team;
    const b = (await mkTeam(tid, u(2), 'B')).body.team;
    const c = (await mkTeam(tid, u(3), 'C')).body.team;
    expect(c.status).toBe('WAITLISTED');
    const decide = (team, decision, user = MGR) => as('post', `/api/tournaments/${tid}/teams/${team}/decision`, user).send({ decision });
    expect((await decide(a.id, 'APPROVE', u(1))).status).toBe(403);
    const tooSmall = await decide(a.id, 'APPROVE');
    expect(tooSmall.status).toBe(409);
    expect(tooSmall.body.code).toBe('ROSTER_INVALID');
    await as('post', `/api/tournaments/${tid}/join/${a.joinCode}`, u(4));
    expect((await decide(a.id, 'APPROVE')).body.team.status).toBe('APPROVED');
    const rej = await decide(b.id, 'REJECT');
    expect(rej.body.promotedTeamIds).toEqual([c.id]);
    expect((await prisma.tournamentTeam.findUnique({ where: { id: c.id } })).status).toBe('PENDING');
    // waitlisted team cannot be approved while full
    const d = (await mkTeam(tid, u(5), 'D')).body.team;
    expect(d.status).toBe('WAITLISTED');
    await as('post', `/api/tournaments/${tid}/join/${d.joinCode}`, u(6));
    expect((await decide(d.id, 'APPROVE')).body.code).toBe('TOURNAMENT_FULL');
  });

  it('withdraw frees the spot and promotes the waitlist', async () => {
    const tid = await newTournament({ maxTeams: 2 });
    const a = (await mkTeam(tid, u(1), 'A')).body.team;
    await mkTeam(tid, u(2), 'B');
    const c = (await mkTeam(tid, u(3), 'C')).body.team;
    const res = await as('delete', `/api/tournaments/${tid}/teams/${a.id}`, u(1));
    expect(res.body.promotedTeamIds).toEqual([c.id]);
    expect((await as('delete', `/api/tournaments/${tid}/teams/${c.id}`, u(9))).status).toBe(403);
  });

  it('roster lock: captains blocked after rosterLockAt, managers still allowed', async () => {
    const tid = await newTournament({ rosterLockAt: new Date(Date.now() + 700).toISOString() });
    const team = (await mkTeam(tid, u(1))).body.team;
    expect((await invite(tid, team.id, u(1), u(2))).status).toBe(201);
    await new Promise((r) => setTimeout(r, 900));
    const late = await invite(tid, team.id, u(1), u(3));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('ROSTER_LOCKED');
    expect((await invite(tid, team.id, MGR, u(3))).status).toBe(201);
    expect((await respond(tid, team.id, u(2), true)).body.code).toBe('ROSTER_LOCKED');
    expect((await as('delete', `/api/tournaments/${tid}/teams/${team.id}/members/${u(3)}`, u(1))).body.code).toBe('ROSTER_LOCKED');
    expect((await as('delete', `/api/tournaments/${tid}/teams/${team.id}/members/${u(3)}`, MGR)).status).toBe(200);
  });

  it('minors: blocked unless openToMinors', async () => {
    const closed = await newTournament({ openToMinors: false });
    expect((await mkTeam(closed, MINOR)).body.code).toBe('MINORS_NOT_ALLOWED');
    const team = (await mkTeam(closed, u(1))).body.team;
    expect((await invite(closed, team.id, u(1), MINOR)).body.code).toBe('MINORS_NOT_ALLOWED');
    expect((await as('post', `/api/tournaments/${closed}/join/${team.joinCode}`, MINOR)).body.code).toBe('MINORS_NOT_ALLOWED');
    const open = await newTournament({ openToMinors: true });
    expect((await mkTeam(open, MINOR)).status).toBe(201);
  });

  it('join code: rotate invalidates the old code; closed registration rejects codes', async () => {
    const tid = await newTournament();
    const team = (await mkTeam(tid, u(1))).body.team;
    expect((await as('post', `/api/tournaments/${tid}/teams/${team.id}/join-code/rotate`, u(2))).status).toBe(403);
    const rotated = (await as('post', `/api/tournaments/${tid}/teams/${team.id}/join-code/rotate`, u(1))).body.joinCode;
    expect(rotated).not.toBe(team.joinCode);
    expect((await as('post', `/api/tournaments/${tid}/join/${team.joinCode}`, u(2))).body.code).toBe('INVALID_CODE');
    await as('post', `/api/tournaments/${tid}/status`, ORG).send({ status: 'REGISTRATION_CLOSED' });
    const closed = await as('post', `/api/tournaments/${tid}/join/${rotated}`, u(2));
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('REGISTRATION_CLOSED');
  });

  it('privacy: strangers see approved teams with name/avatar only, no join code or invitees', async () => {
    const tid = await newTournament({ requireApproval: false });
    const team = (await mkTeam(tid, u(1), 'Pub')).body.team;
    await invite(tid, team.id, u(1), u(2));
    await mkTeam(tid, u(3), 'Other');
    await as('post', `/api/tournaments/${tid}/teams/${(await prisma.tournamentTeam.findFirst({ where: { tournamentId: tid, name: 'Other' } })).id}/decision`, MGR).send({ decision: 'WAITLIST' });
    const stranger = await as('get', `/api/tournaments/${tid}/teams`, u(9));
    const names = stranger.body.teams.map((x) => x.name);
    expect(names).toEqual(['Pub']);
    expect(stranger.body.teams[0].joinCode).toBeUndefined();
    expect(stranger.body.teams[0].members.map((m) => m.userId)).toEqual([u(1)]);
    expect(Object.keys(stranger.body.teams[0].members[0]).sort()).toEqual(['imageUrl', 'jerseyNumber', 'name', 'role', 'status', 'userId']);
    const captain = await as('get', `/api/tournaments/${tid}/teams`, u(1));
    expect(captain.body.teams.find((x) => x.name === 'Pub').joinCode).toBeTruthy();
    expect(captain.body.teams.find((x) => x.name === 'Pub').members).toHaveLength(2);
    const manager = await as('get', `/api/tournaments/${tid}/teams`, MGR);
    expect(manager.body.teams).toHaveLength(2);
    expect((await as('get', `/api/tournaments/${tid}/teams/${(await prisma.tournamentTeam.findFirst({ where: { tournamentId: tid, name: 'Other' } })).id}`, u(9))).status).toBe(404);
  });

  it('only the captain/manager edits the team; seed and manualRank are manager-only', async () => {
    const tid = await newTournament();
    const team = (await mkTeam(tid, u(1))).body.team;
    expect((await as('patch', `/api/tournaments/${tid}/teams/${team.id}`, u(1)).send({ color: '#ff0000', name: 'Renamed' })).body.name).toBe('Renamed');
    expect((await as('patch', `/api/tournaments/${tid}/teams/${team.id}`, u(1)).send({ seed: 1 })).status).toBe(403);
    expect((await as('patch', `/api/tournaments/${tid}/teams/${team.id}`, MGR).send({ seed: 1, manualRank: 2 })).body.seed).toBe(1);
    expect((await as('patch', `/api/tournaments/${tid}/teams/${team.id}`, u(2)).send({ name: 'x' })).status).toBe(403);
  });

  it('captain cannot be removed; members can leave', async () => {
    const tid = await newTournament();
    const team = (await mkTeam(tid, u(1))).body.team;
    await as('post', `/api/tournaments/${tid}/join/${team.joinCode}`, u(2));
    expect((await as('delete', `/api/tournaments/${tid}/teams/${team.id}/members/${u(1)}`, u(1))).body.code).toBe('CAPTAIN_CANNOT_LEAVE');
    expect((await as('delete', `/api/tournaments/${tid}/teams/${team.id}/members/${u(2)}`, u(2))).status).toBe(200);
    expect((await as('delete', `/api/tournaments/${tid}/teams/${team.id}/members/${u(2)}`, u(2))).status).toBe(404);
    expect((await as('patch', `/api/tournaments/${tid}/teams/${team.id}/members/${u(1)}`, u(1)).send({ jerseyNumber: 10 })).body.jerseyNumber).toBe(10);
  });
});
