/**
 * Builds bilingual copy + sends GAME_INVITATION when a manager/organizer
 * manually adds a friend to a game (create-time invite or POST /participants).
 */
const { prisma } = require('../lib/prisma');
const { notificationName } = require('./publicName');
const { formatGameWhen, resolveLocation } = require('./notificationCopy');

/**
 * @param {object} opts
 * @param {string} opts.adderName - Display name of the manager/organizer who added the user
 * @param {object} opts.game - Game row (ideally with `field` and `start`)
 * @returns {{ title: string, body: string, titleEn: string, bodyEn: string, detailsHe: string, detailsEn: string }}
 */
function buildAddedToGameCopy({ adderName, game }) {
  const name = (adderName && String(adderName).trim()) || 'מנהל המשחק';
  const nameEn = (adderName && String(adderName).trim()) || 'a game manager';
  const location = resolveLocation(game);
  const heWhen = formatGameWhen(game?.start, 'he-IL');
  const enWhen = formatGameWhen(game?.start, 'en-GB');

  const detailsHe = [heWhen.date, heWhen.time, location].filter(Boolean).join(' · ');
  const detailsEn = [enWhen.date, enWhen.time, location].filter(Boolean).join(' · ');

  return {
    title: `צורפת למשחק על ידי ${name}`,
    body: detailsHe || (game?.title ? String(game.title) : 'פרטי המשחק זמינים באפליקציה'),
    titleEn: `You were added to a game by ${nameEn}`,
    bodyEn: detailsEn || (game?.title ? String(game.title) : 'Open the app for game details'),
    detailsHe,
    detailsEn,
  };
}

/**
 * Persist + push + socket notify the added user. Never throws to the caller.
 *
 * @param {object} notificationService
 * @param {object} opts
 * @param {string} opts.userId - Recipient
 * @param {string} opts.adderName
 * @param {object} opts.game - Must include id + start; field optional but preferred
 * @param {object} [opts.io]
 * @param {string} [opts.adderId]
 */
async function notifyUserAddedToGame(notificationService, { userId, adderName, game, io, adderId }) {
  if (!notificationService || !userId || !game?.id) return null;

  const resolvedName = await notificationName(prisma, { id: adderId, name: adderName }, null);
  const copy = buildAddedToGameCopy({ adderName: resolvedName || '', game });
  const gameId = game.id;

  try {
    return await notificationService.sendNotification(
      userId,
      'GAME_INVITATION',
      copy.title,
      copy.body,
      {
        gameId,
        link: `/game/${gameId}`,
        adderId: adderId || undefined,
        actorId: adderId || undefined,
        adderName: resolvedName || undefined,
        titleEn: copy.titleEn,
        bodyEn: copy.bodyEn,
      },
      io || null
    );
  } catch (err) {
    console.error('[NOTIFICATIONS] Failed to notify user added to game', gameId, userId, err);
    return null;
  }
}

module.exports = {
  formatGameWhen,
  resolveLocation,
  buildAddedToGameCopy,
  notifyUserAddedToGame,
};
