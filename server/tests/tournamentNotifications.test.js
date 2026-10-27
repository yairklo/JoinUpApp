const request = require('supertest');

jest.setTimeout(180000);
jest.mock('../utils/auth', () => require('./helpers/tournamentAuthMock'));
jest.mock('../workers/reviewWorker', () => ({ processReviewQueue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../workers/cleanupWorker', () => ({
  startCleanupWorker: jest.fn().mockResolvedValue(undefined),
  runCleanup: jest.fn().mockResolvedValue(undefined),
}));

const { app } = require('../index');
const { runReminderSweep } = require('../services/tournamentReminders');
const { notificationService } = require('../services/tournamentNotifications');
const { useOpenTournaments, prisma, ensureUsers, tournamentBody, cleanup, seedTeams } = require('./helpers/tournamentFixtures');

const P = 'tnotif_';
const ORG = `${P}org`;
const MGR = `${P}mgr`;
const SCORER = `${P}scorer`;
const OLD_ENV = process.env.TOURNAMENT_CREATOR_IDS;
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${user}`);
const soon = async (userId, matchId) => (await notes(userId, 'TOURNAMENT_STARTING_SOON')).filter((n) => n.data && n.data.matchId === matchId);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = (userId, type) => prisma.notification.findMany({ where: { userId, ...(type ? { type } : {}) } });

async function newTournament(over = {}, { open = true } = {}) {
  const res = await as('post', '/api/tournaments', ORG).send(tournamentBody({ maxTeams: 16, ...over }));
  const id = res.body.id;
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: MGR, role: 'MANAGER' });
  await as('post', `/api/tournaments/${id}/roles`, ORG).send({ userId: SCORER, role: 'SCOREKEEPER' });
  if (open) await as('post', `/api/tournaments/${id}/status`, ORG).send({ status: 'REGISTRATION_OPEN' });
  return id;
}

describe('tournament notifications and reminders', () => {
  useOpenTournaments();

  beforeAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = ORG;
    await cleanup(P);
    await ensureUsers([ORG, MGR, SCORER, ...[1, 2, 3, 4].map((n) => `${P}u${n}`)]);
  });
  afterAll(async () => {
    process.env.TOURNAMENT_CREATOR_IDS = OLD_ENV;
    await cleanup(P);
    await prisma.$disconnect();
  });

  it('invite: exactly one notification, none on a repeated invite, prefs respected', async () => {
    const tid = await newTournament();
    const u1 = `${P}u1`;
    const u2 = `${P}u2`;
    const u3 = `${P}u3`;
    const team = (await as('post', `/api/tournaments/${tid}/teams`, u1).send({ name: 'Inv' })).body.team;
    const invite = (target) => as('post', `/api/tournaments/${tid}/teams/${team.id}/members`, u1).send({ userId: target });
    expect((await invite(u2)).status).toBe(201);
    expect((await invite(u2)).status).toBe(200);
    await wait(300);
    const got = await notes(u2, 'TOURNAMENT_TEAM_INVITE');
    expect(got).toHaveLength(1);
    expect(got[0].data).toMatchObject({ tournamentId: tid, teamId: team.id });
    // in-app switch off for the "invitations" category -> nothing stored
    await prisma.userNotificationSettings.upsert({
      where: { userId: u3 }, update: { invitationsInApp: false, invitationsPush: false }, create: { userId: u3, invitationsInApp: false, invitationsPush: false },
    });
    expect((await invite(u3)).status).toBe(201);
    await wait(300);
    expect(await notes(u3, 'TOURNAMENT_TEAM_INVITE')).toHaveLength(0);
  });

  it('team decision: captain notified once per decision; waitlist promotion notifies the promoted captain', async () => {
    const tid = await newTournament({ maxTeams: 2, minPlayersPerTeam: 1, startersPerTeam: 1 });
    const caps = [1, 2, 3].map((n) => `${P}u${n}`);
    const teams = [];
    for (const [i, c] of caps.entries()) teams.push((await as('post', `/api/tournaments/${tid}/teams`, c).send({ name: `T${i}` })).body.team);
    expect(teams[2].status).toBe('WAITLISTED');
    const decide = (team, decision) => as('post', `/api/tournaments/${tid}/teams/${team.id}/decision`, MGR).send({ decision });
    expect((await decide(teams[0], 'APPROVE')).status).toBe(200);
    expect((await decide(teams[0], 'APPROVE')).status).toBe(200); // no change -> no second notification
    expect((await decide(teams[1], 'REJECT')).status).toBe(200);
    await wait(500);
    const first = await notes(caps[0], 'TOURNAMENT_TEAM_DECISION');
    expect(first).toHaveLength(1);
    expect(first[0].data.status).toBe('APPROVED');
    expect((await notes(caps[1], 'TOURNAMENT_TEAM_DECISION'))[0].data.status).toBe('REJECTED');
    const promoted = await notes(caps[2], 'TOURNAMENT_TEAM_DECISION');
    expect(promoted).toHaveLength(1);
    expect(promoted[0].data.status).toBe('PENDING');
  });

  it('match scheduled: bulk generation sends one digest per player; a single edit sends the match text', async () => {
    const tid = await newTournament({}, { open: false });
    const teams = await seedTeams(P, tid, 3);
    await prisma.tournament.update({ where: { id: tid }, data: { status: 'REGISTRATION_CLOSED' } });
    const gen = await as('post', `/api/tournaments/${tid}/schedule/generate`, MGR).send({
      schedule: { days: [{ date: '2026-12-10', from: '09:00', to: '18:00' }], courts: 1 },
    });
    expect(gen.status).toBe(200);
    await wait(800);
    const player = teams[0].playerIds[1];
    const digest = await notes(player, 'TOURNAMENT_MATCH_SCHEDULED');
    expect(digest).toHaveLength(1); // 2 matches for this team, one notification
    expect(digest[0].body).toContain('2');
    // reschedule one match: one more, with the single-match text
    const m = (await prisma.tournamentMatch.findMany({ where: { tournamentId: tid, OR: [{ homeTeamId: teams[0].id }, { awayTeamId: teams[0].id }] }, orderBy: { number: 'asc' } }))[0];
    const patch = (body) => as('patch', `/api/tournaments/${tid}/matches/${m.id}`, MGR).send(body);
    expect((await patch({ scheduledAt: '2026-12-11T10:00:00.000Z', force: true })).status).toBe(200);
    expect((await patch({ scheduledAt: '2026-12-11T10:00:00.000Z' })).status).toBe(200); // unchanged -> silent
    await wait(800);
    const after = await notes(player, 'TOURNAMENT_MATCH_SCHEDULED');
    expect(after).toHaveLength(2);
    expect(after.some((n) => n.data && n.data.matchId === m.id)).toBe(true);
  });

  it('results never notify anyone', async () => {
    const tid = await newTournament({}, { open: false });
    const teams = await seedTeams(P, tid, 3);
    await prisma.tournament.update({ where: { id: tid }, data: { status: 'REGISTRATION_CLOSED' } });
    await as('post', `/api/tournaments/${tid}/schedule/generate`, MGR).send({});
    await prisma.tournament.update({ where: { id: tid }, data: { status: 'IN_PROGRESS' } });
    const users = teams.flatMap((t) => t.playerIds);
    const before = await prisma.notification.count({ where: { userId: { in: users } } });
    const [m] = await prisma.tournamentMatch.findMany({ where: { tournamentId: tid }, orderBy: { number: 'asc' } });
    const res = await as('put', `/api/tournaments/${tid}/matches/${m.id}/result`, SCORER).send({ status: 'FINISHED', homeScore: 3, awayScore: 1, expectedVersion: 0 });
    expect(res.status).toBe(200);
    await wait(500);
    expect(await prisma.notification.count({ where: { userId: { in: users } } })).toBe(before);
  });

  describe('starting-soon reminders', () => {
    async function inProgress() {
      const tid = await newTournament({}, { open: false });
      const teams = await seedTeams(P, tid, 2);
      await prisma.tournament.update({ where: { id: tid }, data: { status: 'REGISTRATION_CLOSED' } });
      await as('post', `/api/tournaments/${tid}/schedule/generate`, MGR).send({});
      await prisma.tournament.update({ where: { id: tid }, data: { status: 'IN_PROGRESS' } });
      const [m] = await prisma.tournamentMatch.findMany({ where: { tournamentId: tid } });
      return { tid, teams, m };
    }
    const sweep = (now) => runReminderSweep({ prisma, notificationService, now });

    it('reminds both teams once, even across repeated and concurrent sweeps', async () => {
      const { teams, m } = await inProgress();
      const now = new Date();
      await prisma.tournamentMatch.update({ where: { id: m.id }, data: { scheduledAt: new Date(now.getTime() + 30 * 60 * 1000) } });
      const results = await Promise.all([sweep(now), sweep(now)]);
      expect(results.reduce((a, r) => a + r.reminded, 0)).toBe(1);
      expect((await sweep(now)).reminded).toBe(0);
      const player = teams[0].playerIds[0];
      const other = teams[1].playerIds[1];
      expect(await soon(player, m.id)).toHaveLength(1);
      expect(await soon(other, m.id)).toHaveLength(1);
      // the sentinel is internal: never exposed through the API
      const sched = (await request(app).get(`/api/tournaments/${m.tournamentId}/schedule`)).body;
      expect(sched.matches[0].details).toBeNull();
    });

    it('ignores matches outside the window, finished or in a tournament not in progress', async () => {
      const { tid, teams, m } = await inProgress();
      const now = new Date();
      await prisma.tournamentMatch.update({ where: { id: m.id }, data: { scheduledAt: new Date(now.getTime() + 3 * 3600 * 1000) } });
      expect((await sweep(now)).reminded).toBe(0);
      await prisma.tournamentMatch.update({ where: { id: m.id }, data: { scheduledAt: new Date(now.getTime() + 10 * 60 * 1000), status: 'FINISHED', homeScore: 1, awayScore: 0 } });
      expect((await sweep(now)).reminded).toBe(0);
      await prisma.tournamentMatch.update({ where: { id: m.id }, data: { status: 'SCHEDULED', homeScore: null, awayScore: null } });
      await prisma.tournament.update({ where: { id: tid }, data: { status: 'REGISTRATION_CLOSED' } });
      expect((await sweep(now)).reminded).toBe(0);
      expect(await soon(teams[0].playerIds[0], m.id)).toHaveLength(0);
    });

    it('rescheduling re-arms the reminder', async () => {
      const { tid, teams, m } = await inProgress();
      const now = new Date();
      await prisma.tournamentMatch.update({ where: { id: m.id }, data: { scheduledAt: new Date(now.getTime() + 20 * 60 * 1000) } });
      expect((await sweep(now)).reminded).toBe(1);
      const later = new Date(now.getTime() + 25 * 60 * 1000).toISOString();
      const patched = await as('patch', `/api/tournaments/${tid}/matches/${m.id}`, MGR).send({ scheduledAt: later });
      expect(patched.status).toBe(200);
      const row = await prisma.tournamentMatch.findUnique({ where: { id: m.id } });
      expect(row.details).toBeNull();
      expect((await sweep(new Date(now.getTime() + 10 * 60 * 1000))).reminded).toBe(1);
      expect(await soon(teams[0].playerIds[0], m.id)).toHaveLength(2);
    });

    it('a result written after the reminder keeps the sentinel (no repeat on later sweeps)', async () => {
      const { tid, m } = await inProgress();
      const now = new Date();
      await prisma.tournamentMatch.update({ where: { id: m.id }, data: { scheduledAt: new Date(now.getTime() + 20 * 60 * 1000) } });
      expect((await sweep(now)).reminded).toBe(1);
      const cur = await prisma.tournamentMatch.findUnique({ where: { id: m.id } });
      const live = await as('put', `/api/tournaments/${tid}/matches/${m.id}/result`, SCORER).send({ status: 'LIVE', expectedVersion: cur.version });
      expect(live.status).toBe(200);
      const row = await prisma.tournamentMatch.findUnique({ where: { id: m.id } });
      expect(row.status).toBe('LIVE');
      expect(row.details.reminderSentAt).toBeTruthy();
    });
  });
});
