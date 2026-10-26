process.env.JOINUP_SKIP_DOTENV = '1';

const request = require('supertest');

jest.setTimeout(120000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { prisma, ensureUsers, tournamentBody, cleanup } = require('./helpers/tournamentFixtures');

const P = 'tpriv_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const u = (n) => `${P}u${n}`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);
const adultBirth = new Date('1990-01-01');

async function newTournament(over = {}) {
  const res = await as('post', '/api/tournaments', ORG).send(tournamentBody({
    minPlayersPerTeam: 1,
    startersPerTeam: 1,
    maxPlayersPerTeam: 3,
    ...over,
  }));
  expect(res.status).toBe(201);
  const id = res.body.id;
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: MGR, role: 'MANAGER' });
  await as('post', `/api/tournaments/${id}/status`, ORG).send({ status: 'REGISTRATION_OPEN' });
  return id;
}

const inChat = (tid, userId) => prisma.chatParticipant.findFirst({ where: { chatId: tid, userId } });

describe('private tournament registration and approved-only chat', () => {
  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    const ids = [ORG, MGR, u(1), u(2), u(3), u(4)];
    await ensureUsers(ids, Object.fromEntries(ids.map((id) => [id, { birthDate: adultBirth }])));
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('refuses team registration on a private tournament unless the caller can already view it', async () => {
    const tid = await newTournament({ isPublic: false });
    const stranger = await as('post', `/api/tournaments/${tid}/teams`, u(1)).send({ name: 'Outsiders' });
    expect(stranger.status).toBe(404);
    expect(stranger.body.code).toBe('NOT_FOUND');
    expect(await prisma.tournamentTeam.count({ where: { tournamentId: tid } })).toBe(0);
    expect(await inChat(tid, u(1))).toBeNull();
    expect((await as('get', `/api/tournaments/${tid}`, u(1))).status).toBe(404);

    const orgTeam = await as('post', `/api/tournaments/${tid}/teams`, ORG).send({ name: 'Hosts' });
    expect(orgTeam.status).toBe(201);
    expect((await as('get', `/api/tournaments/${tid}`, u(1))).status).toBe(404);

    const invited = await as('post', `/api/tournaments/${tid}/teams/${orgTeam.body.team.id}/members`, ORG).send({ userId: u(2) });
    expect(invited.status).toBe(201);
    const own = await as('post', `/api/tournaments/${tid}/teams`, u(2)).send({ name: 'Invitees' });
    expect(own.status).toBe(201);
    expect(own.body.team.status).toBe('PENDING');
    expect(await inChat(tid, u(2))).toBeNull();

    const pub = await newTournament({ isPublic: true });
    expect((await as('post', `/api/tournaments/${pub}/teams`, u(3)).send({ name: 'Open' })).status).toBe(201);
  });

  it('still accepts a join code on a private tournament, and chat starts only once the team is approved', async () => {
    const tid = await newTournament({ isPublic: false });
    const created = await as('post', `/api/tournaments/${tid}/teams`, ORG).send({ name: 'Hosts' });
    expect(created.status).toBe(201);
    const team = created.body.team;
    expect(team.status).toBe('PENDING');

    const joined = await as('post', `/api/tournaments/${tid}/join/${team.joinCode}`, u(1));
    expect(joined.status).toBe(200);
    expect((await as('get', `/api/tournaments/${tid}`, u(1))).status).toBe(200);
    expect(await inChat(tid, u(1))).toBeNull();
    expect((await as('get', `/api/messages?roomId=${tid}`, u(1))).status).toBe(403);

    const decision = await as('post', `/api/tournaments/${tid}/teams/${team.id}/decision`, MGR).send({ decision: 'APPROVE' });
    expect(decision.status).toBe(200);
    expect(decision.body.team.status).toBe('APPROVED');
    expect(await inChat(tid, u(1))).toBeTruthy();
    expect((await as('get', `/api/messages?roomId=${tid}`, u(1))).status).toBe(200);

    const later = await as('post', `/api/tournaments/${tid}/teams/${team.id}/members`, ORG).send({ userId: u(4) });
    expect(later.status).toBe(201);
    expect((await as('post', `/api/tournaments/${tid}/teams/${team.id}/members/${u(4)}/respond`, u(4)).send({ accept: true })).status).toBe(200);
    expect(await inChat(tid, u(4))).toBeTruthy();
  });

  it('promotes a waitlisted team into chat only when that promotion approves it', async () => {
    const tid = await newTournament({ isPublic: true, requireApproval: false, maxTeams: 2, minTeams: 2 });
    const a = (await as('post', `/api/tournaments/${tid}/teams`, u(1)).send({ name: 'A' })).body.team;
    const b = (await as('post', `/api/tournaments/${tid}/teams`, u(2)).send({ name: 'B' })).body.team;
    expect(a.status).toBe('APPROVED');
    expect(b.status).toBe('APPROVED');
    expect(await inChat(tid, u(1))).toBeTruthy();
    const waiting = (await as('post', `/api/tournaments/${tid}/teams`, u(3)).send({ name: 'C' })).body;
    expect(waiting.team.status).toBe('WAITLISTED');
    expect(await inChat(tid, u(3))).toBeNull();

    const withdrawn = await as('delete', `/api/tournaments/${tid}/teams/${a.id}`, u(1));
    expect(withdrawn.body.promotedTeamIds).toEqual([waiting.team.id]);
    expect((await prisma.tournamentTeam.findUnique({ where: { id: waiting.team.id } })).status).toBe('APPROVED');
    expect(await inChat(tid, u(3))).toBeTruthy();
  });
});
