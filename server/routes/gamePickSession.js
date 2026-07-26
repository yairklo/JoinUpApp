const express = require('express');
const { authenticateToken } = require('../utils/auth');
const {
  buildPickSessionState,
  updatePickSchedule,
  executePickDraw,
  reorderPickTurnOrder,
  makePick,
  proposeTrade,
  resolveTrade,
} = require('../services/pickSessionService');

const router = express.Router();

function handleError(res, error, fallback) {
  console.error(fallback, error);
  const status = error.status || 500;
  return res.status(status).json({
    error: error.status ? error.message || fallback : fallback,
    ...(error.details ? { details: error.details } : {}),
  });
}

// GET /api/games/:id/pick-session
router.get('/:id/pick-session', authenticateToken, async (req, res) => {
  try {
    const state = await buildPickSessionState(req.params.id, req.user.id);
    const isManager =
      state.organizerId === req.user.id ||
      (state.managers || []).some((m) => m.id === req.user.id);
    if (!isManager) return res.status(403).json({ error: 'Managers only' });
    return res.json(state);
  } catch (e) {
    return handleError(res, e, 'Failed to load pick session');
  }
});

// PUT /api/games/:id/pick-session/schedule — organizer sets draw + picking times
router.put('/:id/pick-session/schedule', authenticateToken, async (req, res) => {
  try {
    const { pickDrawAt, pickingStartsAt } = req.body || {};
    const state = await updatePickSchedule(
      req.params.id,
      req.user.id,
      { pickDrawAt, pickingStartsAt },
      req.io
    );
    return res.json(state);
  } catch (e) {
    return handleError(res, e, 'Failed to update pick schedule');
  }
});

// POST /api/games/:id/pick-session/draw — force/manual draw (organizer; also used by tests)
router.post('/:id/pick-session/draw', authenticateToken, async (req, res) => {
  try {
    const state = await buildPickSessionState(req.params.id, req.user.id);
    if (state.organizerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the game creator can run the draw' });
    }
    const result = await executePickDraw(req.params.id, req.io, { force: !!req.body?.force });
    return res.json(result);
  } catch (e) {
    return handleError(res, e, 'Failed to execute pick draw');
  }
});

// PUT /api/games/:id/pick-session/order — organizer reorders turn sequence
router.put('/:id/pick-session/order', authenticateToken, async (req, res) => {
  try {
    const state = await reorderPickTurnOrder(
      req.params.id,
      req.user.id,
      req.body?.order,
      req.io
    );
    return res.json(state);
  } catch (e) {
    return handleError(res, e, 'Failed to reorder turn order');
  }
});

// POST /api/games/:id/pick-session/pick — pick a bench player for the current turn
router.post('/:id/pick-session/pick', authenticateToken, async (req, res) => {
  try {
    const { playerId, onBehalfOfManagerId } = req.body || {};
    const state = await makePick(
      req.params.id,
      req.user.id,
      { playerId, onBehalfOfManagerId },
      req.io
    );
    return res.json(state);
  } catch (e) {
    return handleError(res, e, 'Failed to make pick');
  }
});

// POST /api/games/:id/pick-session/trades — propose a swap
router.post('/:id/pick-session/trades', authenticateToken, async (req, res) => {
  try {
    const result = await proposeTrade(
      req.params.id,
      req.user.id,
      req.body || {},
      req.io
    );
    return res.json(result);
  } catch (e) {
    return handleError(res, e, 'Failed to propose trade');
  }
});

// POST /api/games/:id/pick-session/trades/:tradeId/resolve
router.post('/:id/pick-session/trades/:tradeId/resolve', authenticateToken, async (req, res) => {
  try {
    const approve = !!(req.body && req.body.approve);
    const state = await resolveTrade(
      req.params.id,
      req.user.id,
      req.params.tradeId,
      approve,
      req.io
    );
    return res.json(state);
  } catch (e) {
    return handleError(res, e, 'Failed to resolve trade');
  }
});

module.exports = router;
