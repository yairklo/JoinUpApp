const { prisma, ROLE_LEVEL, getRoleLevel, mapGameForClient, broadcastGameUpdate } = require('./gameService');

const TEAM_COLORS = ['#f97316', '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#1f2937', '#14b8a6'];

function httpError(message, status, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseTurnOrder(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Organizer + MANAGER role holders — the draft participants. */
async function getManagerIdsForGame(gameId, gameRow) {
  let game = gameRow;
  if (!game) {
    game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { roles: true },
    });
  }
  if (!game) return [];
  const ids = new Set([game.organizerId]);
  for (const r of game.roles || []) {
    if (r.role === 'MANAGER' || r.role === 'ORGANIZER') ids.add(r.userId);
  }
  return [...ids];
}

async function assertCanManagePick(gameId, userId) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { roles: true },
  });
  if (!game) throw httpError('Game not found', 404);
  const level = await getRoleLevel(gameId, userId);
  const isOrganizer = game.organizerId === userId;
  if (!isOrganizer && level < ROLE_LEVEL.MANAGER) {
    throw httpError('Managers only', 403);
  }
  return game;
}

async function ensureManagerTeams(gameId, managerIds) {
  const existing = await prisma.team.findMany({ where: { gameId } });
  const byManager = new Map(existing.filter((t) => t.managerId).map((t) => [t.managerId, t]));

  const users = await prisma.user.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, name: true },
  });
  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name || u.id]));

  let colorIdx = existing.length;
  for (const mid of managerIds) {
    if (byManager.has(mid)) continue;
    const orphan = existing.find((t) => !t.managerId);
    if (orphan && !Array.from(byManager.values()).some((t) => t.id === orphan.id)) {
      const updated = await prisma.team.update({
        where: { id: orphan.id },
        data: { managerId: mid },
      });
      byManager.set(mid, updated);
      continue;
    }
    const created = await prisma.team.create({
      data: {
        gameId,
        managerId: mid,
        name: `${nameById[mid] || 'Manager'}'s Team`,
        color: TEAM_COLORS[colorIdx % TEAM_COLORS.length],
      },
    });
    colorIdx += 1;
    byManager.set(mid, created);
  }
  return byManager;
}

async function ensureManagerPickChat(gameId, managerIds) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, managerPickChatId: true },
  });
  if (!game) throw httpError('Game not found', 404);

  const chatId = game.managerPickChatId || `mgrpick_${gameId}`;

  let room = await prisma.chatRoom.findUnique({ where: { id: chatId } });
  if (!room) {
    room = await prisma.chatRoom.create({
      data: { id: chatId, type: 'MANAGER_PICK' },
    });
  }

  if (game.managerPickChatId !== chatId) {
    await prisma.game.update({
      where: { id: gameId },
      data: { managerPickChatId: chatId },
    });
  }

  for (const uid of managerIds) {
    try {
      await prisma.chatParticipant.create({
        data: { userId: uid, chatId },
      });
    } catch (e) {
      if (e.code !== 'P2002') throw e;
    }
  }

  return chatId;
}

function mapTrade(t) {
  return {
    id: t.id,
    gameId: t.gameId,
    proposerId: t.proposerId,
    receiverId: t.receiverId,
    offeredPlayerIds: t.offeredPlayerIds || [],
    requestedPlayerIds: t.requestedPlayerIds || [],
    status: t.status,
    createdAt: t.createdAt?.toISOString?.() || t.createdAt,
    resolvedAt: t.resolvedAt ? (t.resolvedAt.toISOString?.() || t.resolvedAt) : null,
  };
}

async function buildPickSessionState(gameId, viewerId) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      field: true,
      participants: { include: { user: true, team: true } },
      roles: { include: { user: true } },
      teams: true,
      playerTrades: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      },
      organizer: { select: { id: true, name: true, imageUrl: true } },
    },
  });
  if (!game) throw httpError('Game not found', 404);

  const managerIds = await getManagerIdsForGame(gameId, game);
  const turnOrder = parseTurnOrder(game.pickTurnOrder);
  const currentTurnIndex = game.pickCurrentTurnIndex || 0;
  const currentTurnManagerId =
    turnOrder.length > 0 ? turnOrder[currentTurnIndex % turnOrder.length] : null;

  const managerUsers = await prisma.user.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, name: true, imageUrl: true },
  });
  const managers = managerUsers.map((u) => ({
    id: u.id,
    name: u.name || null,
    avatar: u.imageUrl || null,
    isOrganizer: u.id === game.organizerId,
  }));

  const confirmed = (game.participants || []).filter((p) => p.status === 'CONFIRMED');
  const teams = (game.teams || []).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    managerId: t.managerId || null,
    playerIds: confirmed.filter((p) => p.teamId === t.id).map((p) => p.userId),
    players: confirmed
      .filter((p) => p.teamId === t.id)
      .map((p) => ({
        id: p.userId,
        name: p.user?.name || null,
        avatar: p.user?.imageUrl || null,
      })),
  }));

  const assigned = new Set(confirmed.filter((p) => p.teamId).map((p) => p.userId));
  const bench = confirmed
    .filter((p) => !assigned.has(p.userId))
    .map((p) => ({
      id: p.userId,
      name: p.user?.name || null,
      avatar: p.user?.imageUrl || null,
    }));

  return {
    gameId,
    organizerId: game.organizerId,
    pickDrawAt: game.pickDrawAt ? game.pickDrawAt.toISOString() : null,
    pickDrawExecutedAt: game.pickDrawExecutedAt ? game.pickDrawExecutedAt.toISOString() : null,
    pickingStartsAt: game.pickingStartsAt ? game.pickingStartsAt.toISOString() : null,
    pickingOpenedAt: game.pickingOpenedAt ? game.pickingOpenedAt.toISOString() : null,
    pickSessionStatus: game.pickSessionStatus || 'IDLE',
    pickTurnOrder: turnOrder,
    pickCurrentTurnIndex: currentTurnIndex,
    currentTurnManagerId,
    managers,
    teams,
    bench,
    managerPickChatId: game.managerPickChatId || null,
    pendingTrades: (game.playerTrades || []).map(mapTrade),
    game: mapGameForClient(game, viewerId),
  };
}

function emitPickState(io, gameId, state) {
  if (!io) return;
  io.to(`game_pick_${gameId}`).emit('pick:state', state);
  for (const m of state.managers || []) {
    io.to(`user_${m.id}`).emit('pick:state', state);
  }
}

async function updatePickSchedule(gameId, userId, { pickDrawAt, pickingStartsAt }, io) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) throw httpError('Game not found', 404);
  if (game.organizerId !== userId) throw httpError('Only the game creator can set schedule times', 403);

  const data = {};
  if (typeof pickDrawAt !== 'undefined') {
    data.pickDrawAt = pickDrawAt ? new Date(String(pickDrawAt)) : null;
    if (data.pickDrawAt && data.pickDrawAt > new Date()) {
      data.pickDrawExecutedAt = null;
      if (
        game.pickSessionStatus === 'ORDER_SET' ||
        game.pickSessionStatus === 'DRAW_SCHEDULED' ||
        game.pickSessionStatus === 'IDLE'
      ) {
        data.pickSessionStatus = 'DRAW_SCHEDULED';
        data.pickTurnOrder = null;
        data.pickCurrentTurnIndex = 0;
      }
    } else if (!data.pickDrawAt && !game.pickDrawExecutedAt) {
      data.pickSessionStatus = 'IDLE';
    } else if (data.pickDrawAt) {
      data.pickSessionStatus = 'DRAW_SCHEDULED';
    }
  }
  if (typeof pickingStartsAt !== 'undefined') {
    data.pickingStartsAt = pickingStartsAt ? new Date(String(pickingStartsAt)) : null;
    if (data.pickingStartsAt && data.pickingStartsAt > new Date()) {
      data.pickingOpenedAt = null;
      if (game.pickSessionStatus === 'PICKING') {
        data.pickSessionStatus = game.pickDrawExecutedAt ? 'ORDER_SET' : data.pickSessionStatus || game.pickSessionStatus;
      }
    }
  }

  const effectiveDraw = typeof data.pickDrawAt !== 'undefined' ? data.pickDrawAt : game.pickDrawAt;
  const effectivePick = typeof data.pickingStartsAt !== 'undefined' ? data.pickingStartsAt : game.pickingStartsAt;
  if (effectiveDraw && effectivePick && effectivePick < effectiveDraw) {
    throw httpError('Picking start time must be at or after the draw time', 400);
  }

  if (typeof pickDrawAt !== 'undefined' && data.pickDrawAt && !game.pickDrawExecutedAt) {
    data.pickSessionStatus = 'DRAW_SCHEDULED';
  }

  await prisma.game.update({ where: { id: gameId }, data });
  const state = await buildPickSessionState(gameId, userId);
  emitPickState(io, gameId, state);
  await broadcastGameUpdate(io, gameId);
  return state;
}

async function executePickDraw(gameId, io, { force = false } = {}) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { roles: true, teams: true },
  });
  if (!game) return null;
  if (game.pickDrawExecutedAt && !force) return buildPickSessionState(gameId, game.organizerId);

  const managerIds = await getManagerIdsForGame(gameId, game);
  if (managerIds.length === 0) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        pickDrawExecutedAt: new Date(),
        pickSessionStatus: 'ORDER_SET',
        pickTurnOrder: [],
        pickCurrentTurnIndex: 0,
      },
    });
    return buildPickSessionState(gameId, game.organizerId);
  }

  const order = shuffle(managerIds);
  await ensureManagerTeams(gameId, managerIds);
  const chatId = await ensureManagerPickChat(gameId, managerIds);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      pickDrawExecutedAt: new Date(),
      pickTurnOrder: order,
      pickCurrentTurnIndex: 0,
      pickSessionStatus: 'ORDER_SET',
      managerPickChatId: chatId,
    },
  });

  const state = await buildPickSessionState(gameId, game.organizerId);
  emitPickState(io, gameId, state);
  await broadcastGameUpdate(io, gameId);
  console.log(`Pick draw executed for game ${gameId}: ${order.join(' -> ')}`);
  return state;
}

async function openPicking(gameId, io) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { roles: true },
  });
  if (!game) return null;
  if (game.pickingOpenedAt) return buildPickSessionState(gameId, game.organizerId);

  if (!game.pickDrawExecutedAt) {
    await executePickDraw(gameId, io);
  }

  const managerIds = await getManagerIdsForGame(gameId, game);
  await ensureManagerTeams(gameId, managerIds);
  const chatId = await ensureManagerPickChat(gameId, managerIds);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      pickingOpenedAt: new Date(),
      pickSessionStatus: 'PICKING',
      managerPickChatId: chatId,
    },
  });

  const state = await buildPickSessionState(gameId, game.organizerId);
  emitPickState(io, gameId, state);
  if (io) io.to(`game_pick_${gameId}`).emit('pick:opened', { gameId });
  await broadcastGameUpdate(io, gameId);
  console.log(`Picking opened for game ${gameId}`);
  return state;
}

async function reorderPickTurnOrder(gameId, userId, order, io) {
  const game = await assertCanManagePick(gameId, userId);
  if (game.organizerId !== userId) {
    throw httpError('Only the game creator can reorder the turn sequence', 403);
  }
  if (!game.pickDrawExecutedAt) {
    throw httpError('Turn order is only editable after the draw', 400);
  }
  const managerIds = await getManagerIdsForGame(gameId, game);
  const incoming = Array.isArray(order) ? order.map(String) : [];
  if (incoming.length !== managerIds.length || !managerIds.every((id) => incoming.includes(id))) {
    throw httpError('Order must include exactly all managers', 400);
  }

  const currentId = parseTurnOrder(game.pickTurnOrder)[game.pickCurrentTurnIndex || 0];
  let nextIndex = incoming.indexOf(currentId);
  if (nextIndex < 0) nextIndex = 0;

  await prisma.game.update({
    where: { id: gameId },
    data: {
      pickTurnOrder: incoming,
      pickCurrentTurnIndex: nextIndex,
    },
  });

  const state = await buildPickSessionState(gameId, userId);
  emitPickState(io, gameId, state);
  return state;
}

async function makePick(gameId, actorUserId, { playerId, onBehalfOfManagerId }, io) {
  const game = await assertCanManagePick(gameId, actorUserId);
  if (game.pickSessionStatus !== 'PICKING' || !game.pickingOpenedAt) {
    throw httpError('Picking session is not open yet', 400);
  }

  const turnOrder = parseTurnOrder(game.pickTurnOrder);
  if (!turnOrder.length) throw httpError('No turn order set', 400);

  const currentManagerId = turnOrder[(game.pickCurrentTurnIndex || 0) % turnOrder.length];
  const isOrganizer = game.organizerId === actorUserId;

  let pickingManagerId = currentManagerId;
  if (onBehalfOfManagerId) {
    if (!isOrganizer) throw httpError('Only the game creator can pick on behalf of another manager', 403);
    if (onBehalfOfManagerId !== currentManagerId) {
      throw httpError('Can only pick on behalf of the manager whose turn it is', 400);
    }
    pickingManagerId = onBehalfOfManagerId;
  } else if (actorUserId !== currentManagerId) {
    throw httpError('Not your turn', 403);
  }

  if (!playerId) throw httpError('playerId is required', 400);

  const part = await prisma.participation.findUnique({
    where: { gameId_userId: { gameId, userId: playerId } },
  });
  if (!part || part.status !== 'CONFIRMED') {
    throw httpError('Player is not a confirmed participant', 400);
  }
  if (part.teamId) throw httpError('Player is already assigned to a team', 400);

  let team = await prisma.team.findFirst({
    where: { gameId, managerId: pickingManagerId },
  });
  if (!team) {
    await ensureManagerTeams(gameId, [pickingManagerId]);
    team = await prisma.team.findFirst({ where: { gameId, managerId: pickingManagerId } });
  }
  if (!team) throw httpError('Team not found for manager', 500);

  await prisma.participation.update({
    where: { id: part.id },
    data: { teamId: team.id },
  });

  const remaining = await prisma.participation.count({
    where: { gameId, status: 'CONFIRMED', teamId: null },
  });

  const nextIndex = ((game.pickCurrentTurnIndex || 0) + 1) % turnOrder.length;
  await prisma.game.update({
    where: { id: gameId },
    data: {
      pickCurrentTurnIndex: nextIndex,
      ...(remaining === 0 ? { pickSessionStatus: 'COMPLETED' } : {}),
    },
  });

  const state = await buildPickSessionState(gameId, actorUserId);
  emitPickState(io, gameId, state);
  if (io) {
    io.to(`game_pick_${gameId}`).emit('pick:made', {
      gameId,
      playerId,
      teamId: team.id,
      managerId: pickingManagerId,
      by: actorUserId,
    });
  }
  await broadcastGameUpdate(io, gameId);
  return state;
}

async function proposeTrade(gameId, proposerId, { receiverId, offeredPlayerIds, requestedPlayerIds }, io) {
  await assertCanManagePick(gameId, proposerId);
  if (!receiverId || receiverId === proposerId) {
    throw httpError('Valid receiverId is required', 400);
  }
  const managerIds = await getManagerIdsForGame(gameId);
  if (!managerIds.includes(receiverId)) {
    throw httpError('Receiver must be a manager of this game', 400);
  }

  const offered = Array.isArray(offeredPlayerIds) ? offeredPlayerIds.map(String) : [];
  const requested = Array.isArray(requestedPlayerIds) ? requestedPlayerIds.map(String) : [];
  if (!offered.length || !requested.length) {
    throw httpError('Both offered and requested players are required', 400);
  }

  const proposerTeam = await prisma.team.findFirst({ where: { gameId, managerId: proposerId } });
  const receiverTeam = await prisma.team.findFirst({ where: { gameId, managerId: receiverId } });
  if (!proposerTeam || !receiverTeam) {
    throw httpError('Both managers must have teams before trading', 400);
  }

  const parts = await prisma.participation.findMany({
    where: { gameId, userId: { in: [...offered, ...requested] }, status: 'CONFIRMED' },
  });
  const byUser = Object.fromEntries(parts.map((p) => [p.userId, p]));

  for (const pid of offered) {
    if (!byUser[pid] || byUser[pid].teamId !== proposerTeam.id) {
      throw httpError('Offered players must be on your team', 400);
    }
  }
  for (const pid of requested) {
    if (!byUser[pid] || byUser[pid].teamId !== receiverTeam.id) {
      throw httpError('Requested players must be on the receiver team', 400);
    }
  }

  const trade = await prisma.playerTrade.create({
    data: {
      gameId,
      proposerId,
      receiverId,
      offeredPlayerIds: offered,
      requestedPlayerIds: requested,
      status: 'PENDING',
    },
  });

  const state = await buildPickSessionState(gameId, proposerId);
  emitPickState(io, gameId, state);
  if (io) {
    io.to(`game_pick_${gameId}`).emit('trade:proposed', mapTrade(trade));
    io.to(`user_${receiverId}`).emit('trade:proposed', mapTrade(trade));
  }
  return { trade: mapTrade(trade), state };
}

async function resolveTrade(gameId, userId, tradeId, approve, io) {
  await assertCanManagePick(gameId, userId);
  const trade = await prisma.playerTrade.findUnique({ where: { id: tradeId } });
  if (!trade || trade.gameId !== gameId) throw httpError('Trade not found', 404);
  if (trade.status !== 'PENDING') throw httpError('Trade is not pending', 400);

  if (approve) {
    if (trade.receiverId !== userId) {
      throw httpError('Only the receiving manager can approve this trade', 403);
    }
    const proposerTeam = await prisma.team.findFirst({
      where: { gameId, managerId: trade.proposerId },
    });
    const receiverTeam = await prisma.team.findFirst({
      where: { gameId, managerId: trade.receiverId },
    });
    if (!proposerTeam || !receiverTeam) throw httpError('Teams missing', 400);

    await prisma.$transaction(async (tx) => {
      if (trade.offeredPlayerIds.length) {
        await tx.participation.updateMany({
          where: { gameId, userId: { in: trade.offeredPlayerIds } },
          data: { teamId: receiverTeam.id },
        });
      }
      if (trade.requestedPlayerIds.length) {
        await tx.participation.updateMany({
          where: { gameId, userId: { in: trade.requestedPlayerIds } },
          data: { teamId: proposerTeam.id },
        });
      }
      await tx.playerTrade.update({
        where: { id: tradeId },
        data: { status: 'APPROVED', resolvedAt: new Date() },
      });
    });
  } else {
    if (trade.receiverId !== userId && trade.proposerId !== userId) {
      throw httpError('Not allowed to resolve this trade', 403);
    }
    await prisma.playerTrade.update({
      where: { id: tradeId },
      data: {
        status: trade.proposerId === userId ? 'CANCELLED' : 'REJECTED',
        resolvedAt: new Date(),
      },
    });
  }

  const state = await buildPickSessionState(gameId, userId);
  emitPickState(io, gameId, state);
  if (io) {
    io.to(`game_pick_${gameId}`).emit('trade:resolved', {
      tradeId,
      approved: !!approve,
      by: userId,
    });
  }
  await broadcastGameUpdate(io, gameId);
  return state;
}

async function runPickDrawSweep(io) {
  const now = new Date();
  const games = await prisma.game.findMany({
    where: {
      pickDrawAt: { lte: now },
      pickDrawExecutedAt: null,
    },
    select: { id: true },
  });
  for (const g of games) {
    try {
      await executePickDraw(g.id, io);
    } catch (e) {
      console.error(`Pick draw sweep failed for ${g.id}:`, e);
    }
  }
}

async function runPickingOpenSweep(io) {
  const now = new Date();
  const games = await prisma.game.findMany({
    where: {
      pickingStartsAt: { lte: now },
      pickingOpenedAt: null,
    },
    select: { id: true },
  });
  for (const g of games) {
    try {
      await openPicking(g.id, io);
    } catch (e) {
      console.error(`Picking open sweep failed for ${g.id}:`, e);
    }
  }
}

module.exports = {
  httpError,
  parseTurnOrder,
  getManagerIdsForGame,
  buildPickSessionState,
  emitPickState,
  updatePickSchedule,
  executePickDraw,
  openPicking,
  reorderPickTurnOrder,
  makePick,
  proposeTrade,
  resolveTrade,
  ensureManagerPickChat,
  runPickDrawSweep,
  runPickingOpenSweep,
  mapTrade,
};
