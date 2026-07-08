const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RATING_ELIGIBLE_AFTER_MS = 90 * 60 * 1000;

function getGameRatingEligibleAt(start) {
  return new Date(new Date(start).getTime() + RATING_ELIGIBLE_AFTER_MS);
}

/**
 * A game is rateable when 90 minutes have passed since kickoff OR status is COMPLETED.
 */
function isGameRatingEligible(game) {
  if (!game) return false;
  if (game.status === 'COMPLETED') return true;
  return Date.now() >= getGameRatingEligibleAt(game.start).getTime();
}

async function isConfirmedParticipant(gameId, userId) {
  if (!gameId || !userId) return false;
  const row = await prisma.participation.findUnique({
    where: { gameId_userId: { gameId: String(gameId), userId: String(userId) } },
    select: { status: true },
  });
  return row?.status === 'CONFIRMED';
}

async function getUserRatingSummary(targetId) {
  const agg = await prisma.userRating.aggregate({
    where: { targetId },
    _avg: { score: true },
    _count: { _all: true },
  });
  return {
    ratingAverage:
      agg._count._all > 0 ? Math.round(agg._avg.score * 10) / 10 : null,
    totalRatings: agg._count._all,
  };
}

function validateScore(score) {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

module.exports = {
  RATING_ELIGIBLE_AFTER_MS,
  getGameRatingEligibleAt,
  isGameRatingEligible,
  isConfirmedParticipant,
  getUserRatingSummary,
  validateScore,
};
