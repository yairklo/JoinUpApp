jest.setTimeout(60000);

const { prisma } = require('../lib/prisma');
const {
  getGameResult,
  upsertGameResult,
  deleteGameResult,
  disputeGameResult,
  LOCK_WINDOW_MS,
} = require('../services/gameResultService');

const U = {
  org: 'gr_org',
  mgr: 'gr_mgr',
  mod: 'gr_mod',
  cap: 'gr_cap',
  p1: 'gr_p1',
  p2: 'gr_p2',
  p3: 'gr_p3',
  out: 'gr_outsider',
  pending: 'gr_pending',
};
const ALL = Object.values(U);
const HOUR = 3600 * 1000;

describe('gameResultService', () => {
  let field;
  const gameIds = [];

  async function makeGame({ sport = 'SOCCER', start = new Date(Date.now() - 2 * HOUR), status = 'OPEN' } = {}) {
    const game = await prisma.game.create({
      data: {
        fieldId: field.id,
        organizerId: U.org,
        start,
        sport,
        status,
        maxPlayers: 10,
        roles: {
          create: [
            { userId: U.org, role: 'ORGANIZER' },
            { userId: U.mgr, role: 'MANAGER' },
            { userId: U.mod, role: 'MODERATOR' },
            { userId: U.cap, role: 'CAPTAIN' },
          ],
        },
        participants: {
          create: [
            { userId: U.org, status: 'CONFIRMED' },
            { userId: U.p1, status: 'CONFIRMED' },
            { userId: U.p2, status: 'CONFIRMED' },
            { userId: U.p3, status: 'CONFIRMED' },
            { userId: U.pending, status: 'PENDING' },
          ],
        },
      },
    });
    gameIds.push(game.id);
    return game;
  }

  const soccerBody = (over = {}) => ({
    sides: [
      { label: 'Home', score: 3 },
      { label: 'Away', score: 2 },
    ],
    stats: [
      { userId: U.p1, sideOrder: 0, values: { goals: 2, assists: 1 } },
      { userId: U.p2, sideOrder: 1, values: { goals: 2 } },
    ],
    notes: ' good game ',
    ...over,
  });

  const entryCount = (gameId) => prisma.playerStatEntry.count({ where: { gameId } });

  beforeAll(async () => {
    for (const id of ALL) await prisma.user.upsert({ where: { id }, update: {}, create: { id, name: id } });
    field = await prisma.field.create({
      data: { name: 'gr field', location: 'x', price: 0, available: false, type: 'OPEN' },
    });
  });

  afterAll(async () => {
    try {
      await prisma.userReport.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.playerStatEntry.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameResult.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.participation.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.gameRole.deleteMany({ where: { gameId: { in: gameIds } } });
      await prisma.chatRoom.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
      await prisma.field.delete({ where: { id: field.id } });
      await prisma.user.deleteMany({ where: { id: { in: ALL } } });
    } catch (err) {
      console.warn('gameResult cleanup skipped:', err.message);
    }
    await prisma.$disconnect();
  });

  describe('permission matrix', () => {
    test.each([
      [U.org, false, true],
      [U.mgr, false, true],
      [U.out, true, true],
      [U.mod, false, false],
      [U.cap, false, false],
      [U.p1, false, false],
      [U.out, false, false],
    ])('user %s admin=%s allowed=%s', async (userId, isAdmin, allowed) => {
      const game = await makeGame();
      const p = upsertGameResult(game.id, userId, soccerBody(), { isAdmin });
      if (allowed) {
        const res = await p;
        expect(res.result.sides).toHaveLength(2);
      } else {
        await expect(p).rejects.toMatchObject({ status: 403, code: 'NOT_MANAGER' });
        expect(await prisma.gameResult.count({ where: { gameId: game.id } })).toBe(0);
      }
    });

    test('mid-game is rejected until start + duration has passed', async () => {
      const mid = await makeGame({ start: new Date(Date.now() - 30 * 60 * 1000) });
      await expect(upsertGameResult(mid.id, U.org, soccerBody())).rejects.toMatchObject({ status: 409, code: 'GAME_NOT_FINISHED' });
      expect((await getGameResult(mid.id, U.org)).eligible).toBe(false);
    });

    test('not started game is rejected, started and COMPLETED ok', async () => {
      const future = await makeGame({ start: new Date(Date.now() + 5 * HOUR) });
      await expect(upsertGameResult(future.id, U.org, soccerBody())).rejects.toMatchObject({ status: 409, code: 'GAME_NOT_FINISHED' });
      const done = await makeGame({ start: new Date(Date.now() + 5 * HOUR), status: 'COMPLETED' });
      await expect(upsertGameResult(done.id, U.org, soccerBody())).resolves.toBeTruthy();
    });

    test('cancelled game is rejected', async () => {
      const g = await makeGame({ status: 'CANCELLED' });
      await expect(upsertGameResult(g.id, U.org, soccerBody())).rejects.toMatchObject({ status: 409, code: 'GAME_CANCELLED' });
    });

    test('lock after 7 days: manager denied, admin allowed; delete likewise', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.mgr, soccerBody());
      const row = await prisma.gameResult.findUnique({ where: { gameId: g.id } });
      expect(row.lockedAt.getTime() - row.recordedAt.getTime()).toBe(LOCK_WINDOW_MS);
      await prisma.gameResult.update({ where: { gameId: g.id }, data: { lockedAt: new Date(Date.now() - 1000) } });

      await expect(upsertGameResult(g.id, U.mgr, soccerBody())).rejects.toMatchObject({ status: 403, code: 'RESULT_LOCKED' });
      await expect(deleteGameResult(g.id, U.mgr)).rejects.toMatchObject({ status: 403, code: 'RESULT_LOCKED' });
      const view = await getGameResult(g.id, U.mgr);
      expect(view.locked).toBe(true);
      expect(view.canEdit).toBe(false);
      expect((await getGameResult(g.id, U.out, { isAdmin: true })).canEdit).toBe(true);

      const edited = await upsertGameResult(g.id, U.out, soccerBody({ notes: 'admin fix' }), { isAdmin: true });
      expect(edited.result.notes).toBe('admin fix');
      expect(edited.result.recordedBy.id).toBe(U.mgr);
      const after = await prisma.gameResult.findUnique({ where: { gameId: g.id } });
      expect(after.lockedAt.getTime()).toBeLessThan(Date.now());
      await expect(deleteGameResult(g.id, U.out, { isAdmin: true })).resolves.toEqual({ ok: true });
      expect(await entryCount(g.id)).toBe(0);
    });
  });

  describe('validation', () => {
    let game;
    beforeAll(async () => { game = await makeGame(); });

    const bad = (body, code) =>
      expect(upsertGameResult(game.id, U.org, body)).rejects.toMatchObject({ status: 400, code });

    test('unknown stat key', () => bad(soccerBody({ stats: [{ userId: U.p1, sideOrder: 0, values: { bogus: 1 } }] }), 'INVALID_STATS'));
    test('negative value', () => bad(soccerBody({ stats: [{ userId: U.p1, sideOrder: 0, values: { goals: -1 } }] }), 'INVALID_STATS'));
    test('over cap', () => bad(soccerBody({ stats: [{ userId: U.p1, sideOrder: 0, values: { goals: 9999 } }] }), 'INVALID_STATS'));
    test('non-confirmed player', () => bad(soccerBody({ stats: [{ userId: U.pending, sideOrder: 0, values: { goals: 1 } }] }), 'NOT_CONFIRMED_PARTICIPANT'));
    test('stranger player', () => bad(soccerBody({ stats: [{ userId: U.out, sideOrder: 0, values: {} }] }), 'NOT_CONFIRMED_PARTICIPANT'));
    test('duplicate player', () => bad(soccerBody({ stats: [{ userId: U.p1, values: {} }, { userId: U.p1, values: {} }] }), 'DUPLICATE_PLAYER'));
    test('bad scores', () => bad(soccerBody({ sides: [{ label: 'a', score: -1 }, { label: 'b', score: 0 }] }), 'INVALID_RESULT'));
    test('one side only', () => bad(soccerBody({ sides: [{ label: 'a', score: 1 }] }), 'INVALID_SIDES'));
    test('missing label', () => bad(soccerBody({ sides: [{ label: ' ', score: 1 }, { label: 'b', score: 0 }] }), 'INVALID_SIDES'));
    test('bad sideOrder', () => bad(soccerBody({ stats: [{ userId: U.p1, sideOrder: 5, values: {} }] }), 'INVALID_SIDES'));

    test('invalid tennis set', async () => {
      const t = await makeGame({ sport: 'TENNIS' });
      await expect(
        upsertGameResult(t.id, U.org, { sides: [{ label: 'A', sets: [[6, 5]] }, { label: 'B' }] })
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_RESULT' });
    });

    test('valid tennis derives scores and mirrored sets', async () => {
      const t = await makeGame({ sport: 'TENNIS' });
      const res = await upsertGameResult(t.id, U.org, {
        sides: [{ label: 'A', sets: [[6, 4], [3, 6], [10, 7]] }, { label: 'B' }],
        stats: [{ userId: U.p1, sideOrder: 0, values: { aces: 3 } }],
      });
      expect(res.result.sides.map((s) => s.score)).toEqual([2, 1]);
      expect(res.result.sides.map((s) => s.outcome)).toEqual(['WIN', 'LOSS']);
      expect(res.result.sides[1].sets).toEqual([[4, 6], [6, 3], [7, 10]]);
    });

    test('player sum above team score is a warning, not an error', async () => {
      const g = await makeGame();
      const res = await upsertGameResult(g.id, U.org, soccerBody({
        sides: [{ label: 'H', score: 1 }, { label: 'A', score: 0 }],
        stats: [{ userId: U.p1, sideOrder: 0, values: { goals: 3 } }],
      }));
      expect(res.warnings).toEqual([expect.objectContaining({ code: 'PLAYER_SUM_EXCEEDS_SCORE', sideOrder: 0 })]);
    });
  });

  describe('write semantics', () => {
    test('idempotent re-PUT replaces rows without duplicates', async () => {
      const g = await makeGame();
      const first = await upsertGameResult(g.id, U.org, soccerBody());
      const n = await entryCount(g.id);
      expect(n).toBe(3);
      await upsertGameResult(g.id, U.org, soccerBody());
      expect(await entryCount(g.id)).toBe(n);
      const idsBefore = first.result.sides.map((x) => x.id);
      expect(await prisma.gameResultSide.count({ where: { resultId: first.result.id } })).toBe(2);

      const changed = await upsertGameResult(g.id, U.mgr, soccerBody({
        sides: [{ label: 'Home', score: 0 }, { label: 'Away', score: 4 }],
        stats: [{ userId: U.p3, sideOrder: 1, values: { saves: 5 } }],
      }));
      expect(changed.result.id).toBe(first.result.id);
      expect(changed.result.sides.map((x) => x.id)).toEqual(idsBefore);
      expect(changed.result.stats).toEqual([{ userId: U.p3, sideId: expect.any(String), values: { saves: 5 } }]);
      expect(changed.result.sides.map((s) => s.outcome)).toEqual(['LOSS', 'WIN']);
      expect(changed.result.editedAt).toBeTruthy();
      expect(await entryCount(g.id)).toBe(1);
    });

    test('a player with a side but no values keeps one zero row', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.org, soccerBody({ stats: [{ userId: U.p1, sideOrder: 0 }] }));
      const rows = await prisma.playerStatEntry.findMany({ where: { gameId: g.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(0);
      expect(rows[0].sideId).toBeTruthy();
    });

    test('a player without a side and without values gets no placeholder row', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.org, soccerBody({ stats: [{ userId: U.p1, sideOrder: null }, { userId: U.p2, sideOrder: 1, values: { goals: 1 } }] }));
      const rows = await prisma.playerStatEntry.findMany({ where: { gameId: g.id } });
      expect(rows.map((r) => r.userId)).toEqual([U.p2]);
    });

    test('re-saving replaces all previous stat rows (create and update paths)', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.org, soccerBody());
      expect(await entryCount(g.id)).toBe(3);
      await upsertGameResult(g.id, U.org, soccerBody({ stats: [{ userId: U.p3, sideOrder: 0, values: { goals: 1 } }] }));
      const rows = await prisma.playerStatEntry.findMany({ where: { gameId: g.id } });
      expect(rows.map((r) => r.userId)).toEqual([U.p3]);
    });

    test('transaction rolls back when a late write fails', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.org, soccerBody());
      const before = await prisma.gameResult.findUnique({ where: { gameId: g.id }, include: { sides: true } });
      const entriesBefore = await prisma.playerStatEntry.findMany({ where: { gameId: g.id }, orderBy: { key: 'asc' } });

      const original = prisma.$transaction.bind(prisma);
      const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce((fn, opts) =>
        original(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(target, prop) {
                  if (prop === 'playerStatEntry') {
                    return new Proxy(target.playerStatEntry, {
                      get(m, name) {
                        if (name === 'createMany') return async () => { throw new Error('boom'); };
                        return typeof m[name] === 'function' ? m[name].bind(m) : m[name];
                      },
                    });
                  }
                  const v = target[prop];
                  return typeof v === 'function' ? v.bind(target) : v;
                },
              })
            ),
          opts
        )
      );
      await expect(
        upsertGameResult(g.id, U.org, soccerBody({ sides: [{ label: 'X', score: 9 }, { label: 'Y', score: 0 }] }))
      ).rejects.toThrow('boom');
      spy.mockRestore();

      const after = await prisma.gameResult.findUnique({ where: { gameId: g.id }, include: { sides: true } });
      expect(after.sides.map((s) => [s.label, s.score]).sort()).toEqual(before.sides.map((s) => [s.label, s.score]).sort());
      expect(after.editedAt).toEqual(before.editedAt);
      expect(await prisma.playerStatEntry.findMany({ where: { gameId: g.id }, orderBy: { key: 'asc' } })).toEqual(entriesBefore);
    });

    test('delete removes result and entries; second delete is 404', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.org, soccerBody());
      await expect(deleteGameResult(g.id, U.mgr)).resolves.toEqual({ ok: true });
      expect(await entryCount(g.id)).toBe(0);
      expect(await prisma.gameResult.count({ where: { gameId: g.id } })).toBe(0);
      await expect(deleteGameResult(g.id, U.mgr)).rejects.toMatchObject({ status: 404 });
      await expect(deleteGameResult(g.id, U.p1)).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('getGameResult', () => {
    test('null result, eligibility, roster sides', async () => {
      const g = await makeGame();
      const empty = await getGameResult(g.id, U.p1);
      expect(empty).toMatchObject({ eligible: true, canEdit: false, result: null });
      expect(empty.roster.map((r) => r.userId).sort()).toEqual([U.org, U.p1, U.p2, U.p3].sort());
      expect((await getGameResult(g.id, U.org)).canEdit).toBe(true);

      await upsertGameResult(g.id, U.org, soccerBody());
      const v = await getGameResult(g.id, U.p1);
      expect(v.result.stats).toHaveLength(2);
      expect(v.roster.find((r) => r.userId === U.p1).sideId).toBe(v.result.sides[0].id);
      expect(v.roster.find((r) => r.userId === U.p3).sideId).toBeNull();
    });

    test('friends-only BLOCKED game is 403 for strangers; REQUEST access hides people', async () => {
      const g = await makeGame();
      await prisma.game.update({ where: { id: g.id }, data: { isFriendsOnly: true, friendsOnlyLinkPolicy: 'BLOCKED' } });
      await expect(getGameResult(g.id, U.out)).rejects.toMatchObject({ status: 403, code: 'GAME_FRIENDS_ONLY' });
      await upsertGameResult(g.id, U.org, soccerBody());
      await prisma.game.update({ where: { id: g.id }, data: { friendsOnlyLinkPolicy: 'REQUEST_TO_JOIN' } });
      const v = await getGameResult(g.id, U.out);
      expect(v.roster).toEqual([]);
      expect(v.result.stats).toEqual([]);
      expect(v.result.sides).toHaveLength(2);
    });

    test('per-player stats follow the profile privacy gate', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.org, soccerBody());
      // p1 hides stats; p2 is friends-only; viewer p3 is a plain participant.
      await prisma.user.update({ where: { id: U.p1 }, data: { hideMatchStats: true } });
      await prisma.user.update({ where: { id: U.p2 }, data: { privacyGames: 'FRIENDS_ONLY' } });
      try {
        const asP3 = await getGameResult(g.id, U.p3);
        expect(asP3.result.stats).toEqual([]);
        expect(asP3.result.sides).toHaveLength(2);
        // owner of the stats sees their own; hideMatchStats owner too
        expect((await getGameResult(g.id, U.p1)).result.stats.map((x) => x.userId).sort()).toEqual([U.p1]);
        expect((await getGameResult(g.id, U.p2)).result.stats.map((x) => x.userId).sort()).toEqual([U.p2]);
        // a friend of p2 sees p2 (p1 still hidden)
        await prisma.friendship.create({ data: { userAId: U.p2 < U.p3 ? U.p2 : U.p3, userBId: U.p2 < U.p3 ? U.p3 : U.p2 } });
        expect((await getGameResult(g.id, U.p3)).result.stats.map((x) => x.userId)).toEqual([U.p2]);
        // managers editing see everything
        expect((await getGameResult(g.id, U.mgr)).result.stats).toHaveLength(2);
      } finally {
        await prisma.friendship.deleteMany({ where: { OR: [{ userAId: U.p2 }, { userBId: U.p2 }] } });
        await prisma.user.updateMany({ where: { id: { in: [U.p1, U.p2] } }, data: { hideMatchStats: false, privacyGames: null } });
      }
    });

    test('unknown game is 404', async () => {
      await expect(getGameResult('nope', U.p1)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('disputeGameResult', () => {
    test('participant files one RESULT_DISPUTE against the recorder; repeat is deduped', async () => {
      const g = await makeGame();
      await upsertGameResult(g.id, U.mgr, soccerBody());
      await expect(disputeGameResult(g.id, U.p1, { details: 'wrong score' })).resolves.toEqual({ ok: true });
      await disputeGameResult(g.id, U.p1, {});
      const rows = await prisma.userReport.findMany({ where: { gameId: g.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ reporterId: U.p1, targetId: U.mgr, reason: 'RESULT_DISPUTE', status: 'OPEN', details: 'wrong score' });
    });

    test('non-participant, pending, recorder and missing result are refused', async () => {
      const g = await makeGame();
      await expect(disputeGameResult(g.id, U.p1)).rejects.toMatchObject({ status: 404, code: 'NO_RESULT' });
      await upsertGameResult(g.id, U.mgr, soccerBody());
      await expect(disputeGameResult(g.id, U.out)).rejects.toMatchObject({ status: 403 });
      await expect(disputeGameResult(g.id, U.pending)).rejects.toMatchObject({ status: 403 });
      await prisma.participation.create({ data: { gameId: g.id, userId: U.mgr, status: 'CONFIRMED' } });
      await expect(disputeGameResult(g.id, U.mgr)).rejects.toMatchObject({ status: 400, code: 'OWN_RESULT' });
    });
  });
});
