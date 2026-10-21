const { Prisma } = require('@prisma/client');
const { prisma } = require('../lib/prisma');
const { ROLE_LEVEL, getRoleLevel } = require('./gameService');
const { getGameAccess } = require('../utils/friendsOnlyAccess');
const { publicDisplayName } = require('../utils/publicName');
const { getStatsVisibility } = require('./userStatsService');
const { SPORT_KEYS } = require('../shared/sports');
const {
  validateStats,
  validateResult,
  checkPlayerTotals,
  getStatKeys,
} = require('../shared/matchStats');

const HOUR_MS = 3600 * 1000;
const LOCK_WINDOW_MS = 7 * 24 * 3600 * 1000;
const MAX_LABEL_LENGTH = 60;
const MAX_NOTES_LENGTH = 500;
const MAX_STAT_PLAYERS = 40;
const MAX_DISPUTE_DETAILS = 1000;

function httpError(message, status, code, details) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
}

const GAME_SELECT = {
  id: true,
  sport: true,
  start: true,
  duration: true,
  status: true,
  organizerId: true,
  seriesId: true,
  isFriendsOnly: true,
  friendsOnlyUntil: true,
  friendsOnlyLinkPolicy: true,
};

function isEligible(game, now = new Date()) {
  if (!game || !SPORT_KEYS.includes(game.sport)) return false;
  if (game.status === 'CANCELLED') return false;
  if (game.status === 'COMPLETED') return true;
  // Never mid-game: the game must have run its full length (duration is in hours).
  const endsAt = new Date(game.start).getTime() + (Number(game.duration) || 1) * HOUR_MS;
  return endsAt <= now.getTime();
}

function isLocked(result, now = new Date()) {
  return !!(result?.lockedAt && new Date(result.lockedAt) <= now);
}

async function loadGameOr404(client, gameId) {
  const game = await client.game.findUnique({ where: { id: gameId }, select: GAME_SELECT });
  if (!game) throw httpError('Game not found', 404);
  return game;
}

async function canManageResult(gameId, userId, isAdmin) {
  if (isAdmin) return true;
  if (!userId) return false;
  return (await getRoleLevel(gameId, userId)) >= ROLE_LEVEL.MANAGER;
}

function mapSide(side) {
  return {
    id: side.id,
    order: side.order,
    teamId: side.teamId,
    label: side.label,
    score: side.score,
    sets: side.sets ?? null,
    outcome: side.outcome,
  };
}

function groupEntries(entries) {
  const byUser = new Map();
  for (const e of entries) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, { userId: e.userId, sideId: e.sideId, values: {} });
    byUser.get(e.userId).values[e.key] = e.value;
  }
  return [...byUser.values()];
}

async function filterEntriesByPrivacy(viewerId, entries) {
  const userIds = [...new Set(entries.map((e) => e.userId))];
  if (!userIds.length) return [];
  const [users, friendships] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, birthDate: true, privacyGames: true, hideMatchStats: true } }),
    viewerId
      ? prisma.friendship.findMany({
          where: { OR: [{ userAId: viewerId, userBId: { in: userIds } }, { userBId: viewerId, userAId: { in: userIds } }] },
          select: { userAId: true, userBId: true },
        })
      : [],
  ]);
  const friendIds = new Set(friendships.map((f) => (f.userAId === viewerId ? f.userBId : f.userAId)));
  const allowed = new Set();
  for (const u of users) {
    const vis = await getStatsVisibility(viewerId, u, { isFriend: friendIds.has(u.id) });
    if (vis.visible) allowed.add(u.id);
  }
  return entries.filter((e) => allowed.has(e.userId));
}

async function getGameResult(gameId, viewerId, { isAdmin = false } = {}) {
  const game = await loadGameOr404(prisma, gameId);
  const access = await getGameAccess(prisma, game, viewerId, { isAdmin });
  if (access === 'NONE') throw httpError('This game is for friends only', 403, 'GAME_FRIENDS_ONLY');

  const [result, entries, participants] = await Promise.all([
    prisma.gameResult.findUnique({
      where: { gameId },
      include: { sides: { orderBy: { order: 'asc' } } },
    }),
    prisma.playerStatEntry.findMany({ where: { gameId }, select: { userId: true, sideId: true, key: true, value: true } }),
    prisma.participation.findMany({
      where: { gameId, status: 'CONFIRMED' },
      select: { userId: true, teamId: true, user: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const eligible = isEligible(game);
  const locked = isLocked(result);
  const isManager = await canManageResult(gameId, viewerId, isAdmin);
  const canEdit = eligible && isManager && (isAdmin || !locked);

  // Outsiders holding a friends-only link (access REQUEST) see the score, not who played.
  const showPeople = access === 'FULL';
  // Per-player stats follow the profile gate (owner / hideMatchStats / privacyGames incl. minors).
  // Managers who can edit see every row, otherwise saving would silently drop hidden players' stats.
  const visibleEntries = showPeople && !canEdit ? await filterEntriesByPrivacy(viewerId, entries) : entries;
  const sideByTeam = new Map((result?.sides || []).filter((s) => s.teamId).map((s) => [s.teamId, s.id]));
  const entrySide = new Map(entries.map((e) => [e.userId, e.sideId]));

  let recordedBy = null;
  if (result) {
    const ids = [result.recordedById];
    const u = await prisma.user.findUnique({ where: { id: ids[0] }, select: { id: true, name: true } });
    recordedBy = u ? { id: u.id, name: publicDisplayName(u.name) } : { id: result.recordedById, name: publicDisplayName(null) };
  }

  return {
    eligible,
    canEdit,
    locked,
    sport: game.sport,
    result: result
      ? {
          id: result.id,
          status: result.status,
          sport: result.sport,
          sides: result.sides.map(mapSide),
          stats: showPeople ? groupEntries(visibleEntries) : [],
          notes: result.notes,
          recordedBy,
          recordedAt: result.recordedAt,
          editedAt: result.editedAt,
          lockedAt: result.lockedAt,
        }
      : null,
    roster: showPeople
      ? participants.map((p) => ({
          userId: p.userId,
          name: publicDisplayName(p.user?.name),
          imageUrl: p.user?.imageUrl ?? null,
          sideId: entrySide.get(p.userId) ?? (p.teamId ? sideByTeam.get(p.teamId) ?? null : null),
        }))
      : [],
  };
}

function toBadRequest(code, message, details) {
  return httpError(message, 400, code, details);
}

/** Pure input validation; returns the normalised write model. Throws a 400 on any problem. */
function validateResultInput(sport, body) {
  const input = body && typeof body === 'object' ? body : {};
  if (!SPORT_KEYS.includes(sport)) throw toBadRequest('UNSUPPORTED_SPORT', 'Results are not supported for this sport');
  if (!Array.isArray(input.sides) || input.sides.length !== 2) {
    throw toBadRequest('INVALID_SIDES', 'Exactly two sides are required');
  }
  const sides = input.sides.map((s, i) => {
    const label = typeof s?.label === 'string' ? s.label.trim().slice(0, MAX_LABEL_LENGTH) : '';
    if (!label) throw toBadRequest('INVALID_SIDES', `Side ${i + 1} needs a label`);
    const teamId = typeof s.teamId === 'string' && s.teamId ? s.teamId : null;
    return { label, teamId, score: s.score, sets: s.sets };
  });

  let resultCheck;
  if (sport === 'TENNIS') {
    resultCheck = validateResult(sport, { sets: sides[0].sets, bestOf: input.bestOf });
  } else {
    resultCheck = validateResult(sport, { scores: [sides[0].score, sides[1].score] });
  }
  if (!resultCheck.valid) throw toBadRequest('INVALID_RESULT', 'Invalid result', resultCheck.errors);
  sides.forEach((s, i) => {
    s.score = resultCheck.scores[i];
    s.outcome = resultCheck.outcomes[i];
    if (sport === 'TENNIS') {
      // Client-sent score / side-1 sets are ignored: score = sets won, side 1 sets = mirror of side 0.
      s.sets = i === 0 ? sides[0].sets : sides[0].sets.map(([a, b]) => [b, a]);
    } else {
      s.sets = null;
    }
  });

  const rawStats = input.stats === undefined ? [] : input.stats;
  if (!Array.isArray(rawStats) || rawStats.length > MAX_STAT_PLAYERS) {
    throw toBadRequest('INVALID_STATS', 'stats must be an array');
  }
  const seen = new Set();
  const stats = rawStats.map((p, index) => {
    const userId = typeof p?.userId === 'string' ? p.userId : '';
    if (!userId) throw toBadRequest('INVALID_STATS', 'Each stat row needs a userId', [{ index }]);
    if (seen.has(userId)) throw toBadRequest('DUPLICATE_PLAYER', 'A player appears twice', [{ index, userId }]);
    seen.add(userId);
    let sideOrder = null;
    if (p.sideOrder !== undefined && p.sideOrder !== null) {
      if (p.sideOrder !== 0 && p.sideOrder !== 1) throw toBadRequest('INVALID_SIDES', 'sideOrder must be 0 or 1', [{ index }]);
      sideOrder = p.sideOrder;
    }
    const v = validateStats(sport, p.values === undefined ? {} : p.values);
    if (!v.valid) throw toBadRequest('INVALID_STATS', 'Invalid player stats', v.errors.map((e) => ({ ...e, userId })));
    return { userId, sideOrder, values: v.stats };
  });

  let notes = null;
  if (typeof input.notes === 'string') {
    notes = input.notes.trim() || null;
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      throw toBadRequest('NOTES_TOO_LONG', `Notes must be at most ${MAX_NOTES_LENGTH} characters`, [
        { max: MAX_NOTES_LENGTH, length: notes.length },
      ]);
    }
  }

  const warnings = [];
  // At most one MVP per game: keep the last one in the request, drop the others and say so.
  const mvps = stats.filter((p) => p.values.mvp === 1);
  if (mvps.length > 1) {
    const kept = mvps[mvps.length - 1];
    const dropped = mvps.slice(0, -1);
    for (const p of dropped) delete p.values.mvp;
    warnings.push({ code: 'MULTIPLE_MVP', keptUserId: kept.userId, droppedUserIds: dropped.map((p) => p.userId) });
  }
  for (let order = 0; order < 2; order += 1) {
    const mine = stats.filter((p) => p.sideOrder === order).map((p) => p.values);
    warnings.push(...checkPlayerTotals(sport, sides[order].score, mine).map((w) => ({ ...w, sideOrder: order })));
  }
  return { sides, stats, notes, warnings };
}

async function upsertGameResult(gameId, actorId, body, { isAdmin = false } = {}) {
  if (!actorId) throw httpError('Unauthorized', 401);
  const gameForSport = await loadGameOr404(prisma, gameId);
  if (!(await canManageResult(gameId, actorId, isAdmin))) {
    throw httpError('Only game managers can record results', 403, 'NOT_MANAGER');
  }
  const model = validateResultInput(gameForSport.sport, body);

  const saved = await prisma.$transaction(async (tx) => {
    // Serialise concurrent savers on the game row: the last one wins, and each sees the other's lock state.
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const game = await loadGameOr404(tx, gameId);
    const now = new Date();
    if (game.status === 'CANCELLED') throw httpError('Game was cancelled', 409, 'GAME_CANCELLED');
    if (!isEligible(game, now)) throw httpError('Game has not finished yet', 409, 'GAME_NOT_FINISHED');

    const existing = await tx.gameResult.findUnique({ where: { gameId } });
    if (existing && isLocked(existing, now) && !isAdmin) {
      throw httpError('The result is locked', 403, 'RESULT_LOCKED');
    }

    const participants = await tx.participation.findMany({
      where: { gameId, status: 'CONFIRMED' },
      select: { userId: true },
    });
    const confirmed = new Set(participants.map((p) => p.userId));
    const outsiders = model.stats.filter((p) => !confirmed.has(p.userId)).map((p) => p.userId);
    if (outsiders.length) {
      throw httpError('Only confirmed participants can have stats', 400, 'NOT_CONFIRMED_PARTICIPANT', outsiders.map((userId) => ({ userId })));
    }

    let result;
    if (existing) {
      await tx.playerStatEntry.deleteMany({ where: { gameId } });
      result = await tx.gameResult.update({
        where: { id: existing.id },
        data: { sport: game.sport, status: 'FINAL', notes: model.notes, editedById: actorId, editedAt: now },
      });
    } else {
      await tx.playerStatEntry.deleteMany({ where: { gameId } });
      result = await tx.gameResult.create({
        data: {
          gameId,
          sport: game.sport,
          status: 'FINAL',
          notes: model.notes,
          recordedById: actorId,
          recordedAt: now,
          lockedAt: new Date(now.getTime() + LOCK_WINDOW_MS),
        },
      });
    }

    const sideIds = [];
    for (let order = 0; order < 2; order += 1) {
      const s = model.sides[order];
      // Upsert by [resultId, order] so side ids stay stable across edits.
      const fields = {
        teamId: s.teamId,
        label: s.label,
        score: s.score,
        sets: s.sets === null ? Prisma.DbNull : s.sets,
        outcome: s.outcome,
      };
      const created = await tx.gameResultSide.upsert({
        where: { resultId_order: { resultId: result.id, order } },
        update: fields,
        create: { resultId: result.id, order, ...fields },
      });
      sideIds.push(created.id);
    }

    const keys = getStatKeys(game.sport);
    const rows = [];
    for (const p of model.stats) {
      const sideId = p.sideOrder === null ? null : sideIds[p.sideOrder];
      const entries = Object.entries(p.values);
      // A player with a side always keeps at least one row: W/D/L is derived from entries.
      if (!entries.length) entries.push([keys[0], 0]);
      for (const [key, value] of entries) rows.push({ gameId, userId: p.userId, sideId, key, value });
    }
    if (rows.length) await tx.playerStatEntry.createMany({ data: rows });

    return tx.gameResult.findUnique({ where: { id: result.id } });
  });

  const view = await getGameResult(gameId, actorId, { isAdmin });
  return { ...view, warnings: model.warnings, savedAt: saved.editedAt || saved.recordedAt };
}

async function deleteGameResult(gameId, actorId, { isAdmin = false } = {}) {
  if (!actorId) throw httpError('Unauthorized', 401);
  await loadGameOr404(prisma, gameId);
  if (!(await canManageResult(gameId, actorId, isAdmin))) {
    throw httpError('Only game managers can delete results', 403, 'NOT_MANAGER');
  }
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const existing = await tx.gameResult.findUnique({ where: { gameId } });
    if (!existing) throw httpError('No result recorded', 404, 'NO_RESULT');
    if (isLocked(existing) && !isAdmin) throw httpError('The result is locked', 403, 'RESULT_LOCKED');
    await tx.playerStatEntry.deleteMany({ where: { gameId } });
    await tx.gameResult.delete({ where: { id: existing.id } });
  });
  return { ok: true };
}

/** A confirmed participant disputes the recorded result: becomes a RESULT_DISPUTE report against the recorder. */
async function disputeGameResult(gameId, reporterId, { details } = {}) {
  if (!reporterId) throw httpError('Unauthorized', 401);
  await loadGameOr404(prisma, gameId);
  const [participation, result] = await Promise.all([
    prisma.participation.findUnique({
      where: { gameId_userId: { gameId, userId: reporterId } },
      select: { status: true },
    }),
    prisma.gameResult.findUnique({ where: { gameId }, select: { recordedById: true, editedById: true } }),
  ]);
  if (participation?.status !== 'CONFIRMED') {
    throw httpError('Only confirmed participants can dispute a result', 403, 'NOT_PARTICIPANT');
  }
  if (!result) throw httpError('No result recorded', 404, 'NO_RESULT');
  const targetId = result.editedById || result.recordedById;
  if (targetId === reporterId) throw httpError('You recorded this result yourself', 400, 'OWN_RESULT');

  const clean = typeof details === 'string' ? details.trim().slice(0, MAX_DISPUTE_DETAILS) || null : null;
  const dup = await prisma.userReport.findFirst({
    where: { reporterId, targetId, gameId, reason: 'RESULT_DISPUTE', status: 'OPEN' },
    select: { id: true },
  });
  if (!dup) {
    await prisma.userReport.create({
      data: { reporterId, targetId, gameId, reason: 'RESULT_DISPUTE', details: clean },
    });
  }
  return { ok: true };
}

module.exports = {
  LOCK_WINDOW_MS,
  isEligible,
  isLocked,
  validateResultInput,
  getGameResult,
  upsertGameResult,
  deleteGameResult,
  disputeGameResult,
};
