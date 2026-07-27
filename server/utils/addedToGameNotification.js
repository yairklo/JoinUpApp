/**
 * Builds bilingual copy + sends GAME_INVITATION when a manager/organizer
 * manually adds a friend to a game (create-time invite or POST /participants).
 */

function formatGameWhen(start, locale) {
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };

  const date = d.toLocaleDateString(locale, {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(locale, {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date, time };
}

function resolveLocation(game) {
  if (!game) return '';
  const field = game.field || {};
  const parts = [
    field.name,
    field.location || field.city,
    game.customLocation,
  ].filter((p) => typeof p === 'string' && p.trim());
  // Prefer "name · location" when both exist; otherwise first non-empty.
  if (field.name && (field.location || field.city)) {
    return `${field.name} · ${field.location || field.city}`;
  }
  return parts[0] || '';
}

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
  const enWhen = formatGameWhen(game?.start, 'en-US');

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

  const copy = buildAddedToGameCopy({ adderName, game });
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
        adderName: adderName || undefined,
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
