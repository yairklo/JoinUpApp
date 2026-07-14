const express = require('express');
const { authenticateToken, attachOptionalUser } = require('../utils/auth');
const {
  notificationService,
  mapGameForClient,
  createGame,
  searchGames,
  convertGameToSeries,
  patchGame,
  updateGame,
  deleteGame,
  getPublicGames,
  getMyGames,
  getMyHistory,
  getFriendsGames,
  getCityGames,
  getAllGames,
  getGamesByField,
  getGamesByDate,
  getTodayCityGames,
  getGameById,
  getGameRatings,
} = require('../services/gameService');
const gameRosterRouter = require('./gameRoster');
const gameTeamsRouter = require('./gameTeams');
const gameRolesRouter = require('./gameRoles');

const router = express.Router();

function handleRouteError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);
  const status = error.status || 500;
  return res.status(status).json({
    error: error.status ? (error.message || fallbackMessage) : fallbackMessage,
    ...(error.details ? { details: error.details } : {}),
  });
}

router.get('/public', async (req, res) => {
  try {
    res.json(await getPublicGames(req.query, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get public games');
  }
});

router.get('/my', authenticateToken, async (req, res) => {
  try {
    res.json(await getMyGames(req.user.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to fetch my games');
  }
});

router.get('/my/history', authenticateToken, async (req, res) => {
  try {
    res.json(await getMyHistory(req.user.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to fetch history');
  }
});

router.get('/friends', authenticateToken, async (req, res) => {
  try {
    res.json(await getFriendsGames(req.user.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to find games with friends');
  }
});

router.get('/city', attachOptionalUser, async (req, res) => {
  try {
    res.json(await getCityGames(req.query.city, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get games by city');
  }
});

router.post('/:id/recurrence', authenticateToken, async (req, res) => {
  try {
    const { copyParticipants } = req.body || {};
    const isAdmin = !!req.user?.isAdmin;
    const result = await convertGameToSeries(
      req.params.id,
      copyParticipants,
      req.user.id,
      isAdmin,
      req.io
    );
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'Failed to convert game to series');
  }
});

router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    res.json(await patchGame(req.params.id, req.body, req.user.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to update game');
  }
});

router.get('/', attachOptionalUser, async (req, res) => {
  try {
    res.json(await getAllGames(req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get games');
  }
});

router.get('/search', attachOptionalUser, async (req, res) => {
  try {
    res.json(await searchGames(req.query, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to search games');
  }
});

router.get('/field/:fieldId', attachOptionalUser, async (req, res) => {
  try {
    res.json(await getGamesByField(req.params.fieldId, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get games by field');
  }
});

router.get('/date/:date', attachOptionalUser, async (req, res) => {
  try {
    res.json(await getGamesByDate(req.params.date, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get games by date');
  }
});

router.get('/today-city', attachOptionalUser, async (req, res) => {
  try {
    res.json(await getTodayCityGames(req.query.city, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get games');
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const game = await createGame(req.body, req.user, req.io);
    return res.status(201).json(mapGameForClient(game, req.user.id));
  } catch (error) {
    return handleRouteError(res, error, 'Failed to create game');
  }
});

router.get('/:id/ratings', authenticateToken, async (req, res) => {
  try {
    res.json(await getGameRatings(req.params.id, req.user.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to load game ratings');
  }
});

router.get('/:id', attachOptionalUser, async (req, res) => {
  try {
    res.json(await getGameById(req.params.id, req.user?.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to get game');
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    res.json(await updateGame(req.params.id, req.body, req.user.id));
  } catch (error) {
    handleRouteError(res, error, 'Failed to update game');
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    res.json(await deleteGame(req.params.id, req.user.id, !!req.user?.isAdmin, req.io));
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete game');
  }
});

// Sub-domain routers (roster / teams / roles)
router.use(gameRosterRouter);
router.use(gameTeamsRouter);
router.use(gameRolesRouter);

module.exports = router;
