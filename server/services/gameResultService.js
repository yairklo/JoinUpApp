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
  deriveOutcome,
} = require('../shared/matchStats');
const { expandFixedRounds, summarizeEvening, MAX_ROUNDS } = require('../shared/eveningSummary');

const HOUR_MS = 3600 * 1000;
const LOCK_WINDOW_MS = 7 * 24 * 3600 * 1000;
const MAX_LABEL_LENGTH = 60;
const MAX_NOTES_LENGTH = 500;
const MAX_STAT_PLAYERS = 40;
const MAX_DISPUTE_DETAILS = 1000;
const MAX_SCORER_GOALS = 300;
const LINEUP_MODES = new Set(['FIXED_TEAMS', 'ROTATING_LINEUPS']);

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
      include: {
        rounds: {
          orderBy: { order: 'asc' },
          include: {
            sides: {
              orderBy: { order: 'asc' },
              include: { players: { select: { userId: true, goals: true } } },
            },
          },
        },
      },
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
  let rounds = result?.rounds || [];
  if (result && !rounds.length) {
    const loose = await prisma.gameResultSide.findMany({ where: { resultId: result.id }, orderBy: { order: 'asc' } });
    rounds = [{ id: null, order: 1, sides: loose.map((s) => ({ ...s, players: [] })) }];
  }
  const roundUserIds = rounds.flatMap((r) => r.sides.flatMap((s) => (s.players || []).map((p) => p.userId)));
  const probeIds = [...new Set([...entries.map((e) => e.userId), ...roundUserIds])];
  // Per-player stats follow the profile gate (owner / hideMatchStats / privacyGames incl. minors).
  // Managers who can edit see every row, otherwise saving would silently drop hidden players' stats.
  const allowed = showPeople && !canEdit && probeIds.length
    ? new Set((await filterEntriesByPrivacy(viewerId, probeIds.map((userId) => ({ userId, sideId: null, key: '_', value: 0 })))).map((e) => e.userId))
    : new Set(probeIds);
  const visibleEntries = !showPeople ? [] : canEdit ? entries : entries.filter((e) => allowed.has(e.userId));
  const topSides = rounds[0]?.sides || [];
  const sideByTeam = new Map(topSides.filter((s) => s.teamId).map((s) => [s.teamId, s.id]));
  const entrySide = new Map(entries.map((e) => [e.userId, e.sideId]));
  const mappedRounds = rounds.map((round) => ({
    id: round.id,
    order: round.order,
    sides: round.sides.map((side) => ({
      ...mapSide(side),
      players: !showPeople
        ? []
        : (side.players || [])
            .filter((p) => canEdit || allowed.has(p.userId))
            .map((p) => ({ userId: p.userId, goals: p.goals })),
    })),
  }));
  const summary = result
    ? summarizeEvening({
        lineupMode: result.lineupMode,
        rounds: mappedRounds,
        roster: showPeople ? participants.map((p) => ({ userId: p.userId, teamId: p.teamId })) : [],
      })
    : null;

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
          lineupMode: result.lineupMode,
          sides: topSides.map(mapSide),
          rounds: mappedRounds,
          summary,
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
          teamId: p.teamId ?? null,
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

function parseNotes(input) {
  if (typeof input.notes !== 'string') return null;
  const notes = input.notes.trim() || null;
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    throw toBadRequest('NOTES_TOO_LONG', `Notes must be at most ${MAX_NOTES_LENGTH} characters`, [
      { max: MAX_NOTES_LENGTH, length: notes.length },
    ]);
  }
  return notes;
}

function scoringKey(sport) {
  if (sport === 'BASKETBALL') return 'points';
  if (sport === 'SOCCER') return 'goals';
  return null;
}

/** Multi-round body. A single round with no lineupMode is stored like a one-score result. */
function validateRoundsInput(sport, body) {
  const input = body && typeof body === 'object' ? body : {};
  if (!SPORT_KEYS.includes(sport)) throw toBadRequest('UNSUPPORTED_SPORT', 'Results are not supported for this sport');
  if (!Array.isArray(input.rounds) || input.rounds.length < 1 || input.rounds.length > MAX_ROUNDS) {
    throw toBadRequest('INVALID_ROUNDS', `Add between 1 and ${MAX_ROUNDS} rounds`);
  }
  const rawMode = input.lineupMode;
  if (rawMode != null && !LINEUP_MODES.has(rawMode)) {
    throw toBadRequest('LINEUP_MODE_REQUIRED', 'Choose fixed teams or rotating lineups');
  }
  if (input.rounds.length > 1 && !LINEUP_MODES.has(rawMode)) {
    throw toBadRequest('LINEUP_MODE_REQUIRED', 'Choose fixed teams or rotating lineups');
  }
  const lineupMode = LINEUP_MODES.has(rawMode) ? rawMode : null;
  const warnings = [];
  const rounds = input.rounds.map((round, ri) => {
    if (!Array.isArray(round?.sides) || round.sides.length !== 2) {
      throw toBadRequest('INVALID_SIDES', 'Exactly two sides are required', [{ round: ri }]);
    }
    const sides = round.sides.map((s, i) => {
      const label = typeof s?.label === 'string' ? s.label.trim().slice(0, MAX_LABEL_LENGTH) : '';
      if (!label) throw toBadRequest('INVALID_SIDES', `Side ${i + 1} needs a label`, [{ round: ri }]);
      const teamId = typeof s.teamId === 'string' && s.teamId ? s.teamId : null;
      const rawPlayers = s.players === undefined ? [] : s.players;
      if (!Array.isArray(rawPlayers) || rawPlayers.length > MAX_STAT_PLAYERS) {
        throw toBadRequest('INVALID_STATS', 'players must be an array', [{ round: ri }]);
      }
      const seen = new Set();
      const players = rawPlayers.map((p, pi) => {
        const userId = typeof p?.userId === 'string' ? p.userId : '';
        if (!userId) throw toBadRequest('INVALID_STATS', 'Each player needs a userId', [{ round: ri, index: pi }]);
        if (seen.has(userId)) throw toBadRequest('DUPLICATE_PLAYER', 'A player appears twice', [{ round: ri, userId }]);
        seen.add(userId);
        const goals = p.goals === undefined || p.goals === null ? 0 : p.goals;
        if (typeof goals !== 'number' || !Number.isInteger(goals) || goals < 0 || goals > MAX_SCORER_GOALS) {
          throw toBadRequest('INVALID_STATS', 'goals must be a non-negative integer', [{ round: ri, userId }]);
        }
        return { userId, goals };
      });
      return { label, teamId, score: s.score, sets: s.sets, players };
    });
    const everyone = [...sides[0].players, ...sides[1].players].map((p) => p.userId);
    if (new Set(everyone).size !== everyone.length) {
      throw toBadRequest('DUPLICATE_PLAYER', 'A player is on both sides', [{ round: ri }]);
    }
    if (lineupMode === 'ROTATING_LINEUPS' && sides.some((s) => !s.players.length)) {
      throw toBadRequest('INVALID_SIDES', 'Each side needs at least one player', [{ round: ri }]);
    }
    if (lineupMode === 'FIXED_TEAMS' && sides[0].teamId && sides[0].teamId === sides[1].teamId) {
      throw toBadRequest('INVALID_SIDES', 'A team cannot play itself', [{ round: ri }]);
    }
    let resultCheck;
    if (sport === 'TENNIS' && sides[0].sets) {
      resultCheck = validateResult(sport, { sets: sides[0].sets, bestOf: input.bestOf });
    } else if (sport === 'TENNIS') {
      const scores = [sides[0].score, sides[1].score];
      const ok = scores.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5);
      resultCheck = ok
        ? { valid: true, scores, outcomes: scores.map((s, i) => deriveOutcome(s, scores[1 - i])) }
        : { valid: false, errors: [{ code: 'INVALID_SCORES' }] };
    } else {
      resultCheck = validateResult(sport, { scores: [sides[0].score, sides[1].score] });
    }
    if (!resultCheck.valid) {
      throw toBadRequest('INVALID_RESULT', 'Invalid result', resultCheck.errors.map((e) => ({ ...e, round: ri })));
    }
    sides.forEach((s, i) => {
      s.score = resultCheck.scores[i];
      s.outcome = resultCheck.outcomes[i];
      if (sport === 'TENNIS' && sides[0].sets) s.sets = i === 0 ? sides[0].sets : sides[0].sets.map(([a, b]) => [b, a]);
      else s.sets = null;
    });
    const key = scoringKey(sport);
    if (key) {
      sides.forEach((s, i) => {
        warnings.push(
          ...checkPlayerTotals(sport, s.score, s.players.map((p) => ({ [key]: p.goals }))).map((w) => ({ ...w, round: ri, sideOrder: i })),
        );
      });
    }
    return { sides };
  });
  return { lineupMode, rounds, notes: parseNotes(input), warnings, legacyStats: null };
}

async function persistRounds(tx, resultId, rounds) {
  const kept = [];
  const sideIds = [];
  for (let i = 0; i < rounds.length; i += 1) {
    const round = await tx.gameResultRound.upsert({
      where: { resultId_order: { resultId, order: i + 1 } },
      create: { resultId, order: i + 1 },
      update: {},
    });
    kept.push(round.id);
    const ids = [];
    for (let s = 0; s < 2; s += 1) {
      const side = rounds[i].sides[s];
      const fields = {
        teamId: side.teamId,
        label: side.label,
        score: side.score,
        sets: side.sets == null ? Prisma.DbNull : side.sets,
        outcome: side.outcome,
      };
      const row = await tx.gameResultSide.upsert({
        where: { roundId_order: { roundId: round.id, order: s } },
        create: { resultId, roundId: round.id, order: s, ...fields },
        update: { resultId, ...fields },
      });
      await tx.gameResultRoundPlayer.deleteMany({ where: { sideId: row.id } });
      if (side.players.length) {
        await tx.gameResultRoundPlayer.createMany({
          data: side.players.map((p) => ({ sideId: row.id, userId: p.userId, goals: p.goals })),
        });
      }
      ids.push(row.id);
    }
    sideIds.push(ids);
  }
  await tx.gameResultRound.deleteMany({ where: { resultId, id: { notIn: kept } } });
  return sideIds;
}

function rowsFromRoundPlayers(sport, gameId, rounds, sideIds) {
  const key = scoringKey(sport);
  if (!key) return [];
  const byUser = new Map();
  rounds.forEach((round, ri) => {
    round.sides.forEach((side, si) => {
      for (const p of side.players) {
        const cur = byUser.get(p.userId) || { goals: 0, sideId: sideIds[ri][si] };
        cur.goals += p.goals;
        cur.sideId = sideIds[ri][si];
        byUser.set(p.userId, cur);
      }
    });
  });
  const single = rounds.length === 1;
  return [...byUser.entries()].map(([userId, cur]) => ({
    gameId,
    userId,
    sideId: single ? cur.sideId : null,
    key,
    value: cur.goals,
  }));
}

async function upsertGameResult(gameId, actorId, body, { isAdmin = false } = {}) {
  if (!actorId) throw httpError('Unauthorized', 401);
  const gameForSport = await loadGameOr404(prisma, gameId);
  if (!(await canManageResult(gameId, actorId, isAdmin))) {
    throw httpError('Only game managers can record results', 403, 'NOT_MANAGER');
  }
  const roundsMode = !!(body && Array.isArray(body.rounds));
  let model = roundsMode
    ? validateRoundsInput(gameForSport.sport, body)
    : (() => {
        const legacy = validateResultInput(gameForSport.sport, body);
        return {
          lineupMode: null,
          notes: legacy.notes,
          warnings: legacy.warnings,
          rounds: [{ sides: legacy.sides.map((s) => ({ ...s, players: [] })) }],
          legacyStats: legacy.stats,
        };
      })();

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
    // An old client sends only `sides`. That must not wipe an evening that already has several rounds.
    if (!roundsMode && existing) {
      const extra = await tx.gameResultRound.count({ where: { resultId: existing.id, order: { gt: 1 } } });
      if (existing.lineupMode || extra > 0) {
        throw httpError('This result has several rounds', 409, 'MULTI_ROUND_RESULT');
      }
    }

    const participants = await tx.participation.findMany({
      where: { gameId, status: 'CONFIRMED' },
      select: { userId: true, teamId: true },
    });
    const confirmed = new Set(participants.map((p) => p.userId));
    if (roundsMode && model.lineupMode === 'FIXED_TEAMS') {
      model = { ...model, rounds: expandFixedRounds(model.rounds, participants) };
      for (const round of model.rounds) {
        const ids = round.sides.flatMap((s) => s.players.map((p) => p.userId));
        if (new Set(ids).size !== ids.length) {
          throw httpError('A player is on both sides', 400, 'DUPLICATE_PLAYER');
        }
      }
    }
    if (roundsMode) {
      const teams = await tx.team.findMany({ where: { gameId }, select: { id: true } });
      const knownTeams = new Set(teams.map((t) => t.id));
      for (const round of model.rounds) {
        for (const side of round.sides) {
          if (side.teamId && !knownTeams.has(side.teamId)) {
            throw httpError('Unknown team', 400, 'INVALID_SIDES');
          }
        }
      }
    }
    const mentioned = new Set();
    for (const round of model.rounds) for (const side of round.sides) for (const p of side.players) mentioned.add(p.userId);
    for (const p of model.legacyStats || []) mentioned.add(p.userId);
    const outsiders = [...mentioned].filter((id) => !confirmed.has(id));
    if (outsiders.length) {
      throw httpError('Only confirmed participants can have stats', 400, 'NOT_CONFIRMED_PARTICIPANT', outsiders.map((userId) => ({ userId })));
    }

    await tx.playerStatEntry.deleteMany({ where: { gameId } });
    const lineupMode = roundsMode ? model.lineupMode : null;
    let result;
    if (existing) {
      result = await tx.gameResult.update({
        where: { id: existing.id },
        data: { sport: game.sport, status: 'FINAL', notes: model.notes, lineupMode, editedById: actorId, editedAt: now },
      });
    } else {
      result = await tx.gameResult.create({
        data: {
          gameId,
          sport: game.sport,
          status: 'FINAL',
          notes: model.notes,
          lineupMode,
          recordedById: actorId,
          recordedAt: now,
          lockedAt: new Date(now.getTime() + LOCK_WINDOW_MS),
        },
      });
    }

    // Upsert by round + side order so side ids stay stable across edits of the same rounds.
    const sideIds = await persistRounds(tx, result.id, model.rounds);

    const rows = [];
    if (model.legacyStats) {
      const keys = getStatKeys(game.sport);
      for (const p of model.legacyStats) {
        const sideId = p.sideOrder === null ? null : sideIds[0][p.sideOrder];
        const entries = Object.entries(p.values);
        // A player with a side always keeps at least one row: W/D/L is derived from entries.
        // A player without a side has no outcome to carry, so no placeholder row.
        if (!entries.length && sideId) entries.push([keys[0], 0]);
        for (const [key, value] of entries) rows.push({ gameId, userId: p.userId, sideId, key, value });
      }
    } else {
      rows.push(...rowsFromRoundPlayers(game.sport, gameId, model.rounds, sideIds));
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
