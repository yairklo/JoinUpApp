/**
 * Bilingual notification copy. Every builder returns `{ title, body, titleEn, bodyEn }`:
 * `title`/`body` (Hebrew) are what gets stored and pushed by default; `titleEn`/`bodyEn` travel in
 * `data` (see `enData`) so an English client/device can show English in-app and in the OS push.
 *
 * `name` params are nullable: pass the resolved public name or null — each language then falls back
 * to its own word ('משתמש' vs 'Someone') instead of leaking a Hebrew fallback into English copy.
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
    hourCycle: 'h23',
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

const nm = (name, he, en) => ({
  he: (typeof name === 'string' && name.trim()) || he,
  en: (typeof name === 'string' && name.trim()) || en,
});

/** The `data` fragment carrying the English copy. */
function enData(copy) {
  return { titleEn: copy.titleEn, bodyEn: copy.bodyEn };
}

const out = (title, body, titleEn, bodyEn) => ({ title, body, titleEn, bodyEn });

// ---- Games ------------------------------------------------------------------------------------

function gameJoinedOrganizer({ name }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('מישהו הצטרף למשחק שלך', `${n.he} הצטרף/ה למשחק שלך`,
    'Someone joined your game', `${n.en} joined your game`);
}

function gameJoinRequestOrganizer({ name }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('בקשת הצטרפות חדשה', `${n.he} ביקש/ה להצטרף למשחק שלך וממתין/ה לאישורך`,
    'New join request', `${n.en} asked to join your game and is waiting for your approval`);
}

function gameWaitlistJoinOrganizer({ name }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('מישהו נוסף לרשימת ההמתנה', `${n.he} הצטרף/ה לרשימת ההמתנה של המשחק שלך`,
    'Someone joined your waitlist', `${n.en} joined the waitlist of your game`);
}

function gameWaitlistOffer() {
  return out('התפנה מקום במשחק!', 'התפנה מקום במשחק! לחץ כאן כדי לאשר את הצטרפותך',
    'A spot opened up!', 'A spot opened up in the game! Tap to confirm your place');
}

function gameJoinDecision({ approved, enteredLottery = false }) {
  if (!approved) {
    return out('הבקשה שלך נדחתה', 'בקשתך להצטרף למשחק נדחתה על ידי המארגן',
      'Your request was declined', 'The organizer declined your request to join the game');
  }
  return out('הבקשה שלך אושרה',
    enteredLottery ? 'בקשתך אושרה ונרשמת להגרלה על המקומות במשחק' : 'בקשתך להצטרף למשחק אושרה על ידי המארגן',
    'Your request was approved',
    enteredLottery
      ? 'Your request was approved and you were entered into the lottery for spots in the game'
      : 'The organizer approved your request to join the game');
}

function gameCancelled({ gameTitle, when }) {
  return out('המשחק בוטל', `${gameTitle || 'המשחק'} (${when}) בוטל על ידי המארגן`,
    'Game cancelled', `${gameTitle || 'The game'} (${when}) was cancelled by the organizer`);
}

function gameRemovedPeer({ gameTitle, bypassed = false }) {
  if (bypassed) {
    return out('בוטל מועד ההצטרפות שלך', `מנהל המשחק ביטל את הצעת ההצטרפות שלך למשחק: ${gameTitle || 'משחק כדורגל'}`,
      'Your join offer was cancelled', `The game manager cancelled your offer to join: ${gameTitle || 'Football game'}`);
  }
  return out('הוסרת מהמשחק', `מנהל המשחק הסיר אותך מהמשחק: ${gameTitle || 'משחק כדורגל'}`,
    'You were removed from the game', `The game manager removed you from: ${gameTitle || 'Football game'}`);
}

/** Location + date/time line, in the requested language ('he-IL' | 'en-US'). */
function describeGame(game, locale = 'he-IL') {
  const when = formatGameWhen(game.start, locale);
  const loc = resolveLocation(game);
  return [loc, [when.date, when.time].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
}

function friendJoinedGame({ name, game }) {
  const n = nm(name, 'חבר/ה', 'A friend');
  return out(`${n.he} הצטרף/ה למשחק`, describeGame(game) || game.title || 'משחק',
    `${n.en} joined a game`, describeGame(game, 'en-GB') || game.title || 'Game');
}

function friendNewGame({ name, game }) {
  const n = nm(name, 'חבר/ה', 'A friend');
  return out(`${n.he} פתח/ה משחק חדש`, describeGame(game) || game.title || 'משחק חדש',
    `${n.en} created a new game`, describeGame(game, 'en-GB') || game.title || 'New game');
}

function newGameInCity({ name, game }) {
  const n = nm(name, 'מישהו', 'Someone');
  const city = game.field.city;
  const field = game.field.name;
  return out(`משחק חדש ב${city}`, `${n.he} פתח/ה משחק חדש ב${field || 'מגרש חדש'}`,
    `New game in ${city}`, `${n.en} created a new game at ${field || 'a new field'}`);
}

function registrationText(registrationOpensAt) {
  if (!registrationOpensAt) return { he: 'ההרשמה פתוחה כעת', en: 'Registration is open now' };
  const d = new Date(registrationOpensAt);
  const fmt = (locale) => d.toLocaleString(locale, {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  });
  return { he: `ההרשמה תיפתח ב-${fmt('he-IL')}`, en: `Registration opens ${fmt('en-GB')}` };
}

function newSeriesGame({ game }) {
  const reg = registrationText(game.registrationOpensAt);
  return out('משחק חדש לקבוצה שלך נוצר!',
    `${game.title || 'משחק'} נוצר עבור הקבוצה שלך. ${reg.he}. לחץ כאן כדי להירשם!`,
    'A new game was created for your group!',
    `${game.title || 'A game'} was created for your group. ${reg.en}. Tap to sign up!`);
}

// ---- Series (groups) -----------------------------------------------------------------------------

function seriesJoinRequest({ name, groupName }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('בקשת הצטרפות לקבוצה', `${n.he} ביקש/ה להצטרף לקבוצה ${groupName}`,
    'Group join request', `${n.en} asked to join the group ${groupName}`);
}

function seriesJoinDecision({ approved, groupName }) {
  if (approved) {
    return out('הבקשה שלך אושרה', `הצטרפת לקבוצה ${groupName}`,
      'Your request was approved', `You joined the group ${groupName}`);
  }
  return out('הבקשה שלך נדחתה', `בקשתך להצטרף לקבוצה ${groupName} נדחתה`,
    'Your request was declined', `Your request to join the group ${groupName} was declined`);
}

function seriesMemberAdded({ name, groupName }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('צורפת לקבוצה', `${n.he} צירף/ה אותך לקבוצה ${groupName}`,
    'You were added to a group', `${n.en} added you to the group ${groupName}`);
}

// ---- Friends ----------------------------------------------------------------------------------

function friendRequest({ name }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('בקשת חברות חדשה', `${n.he} שלח/ה לך בקשת חברות`,
    'New friend request', `${n.en} sent you a friend request`);
}

function friendAccepted({ name }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('בקשת חברות אושרה', `${n.he} אישר/ה את בקשת החברות שלך`,
    'Friend request accepted', `${n.en} accepted your friend request`);
}

// ---- Tournaments ------------------------------------------------------------------------------

function tournamentTeamInvite({ name, teamName, tournamentTitle }) {
  const n = nm(name, 'משתמש', 'Someone');
  return out('הוזמנת לקבוצה בטורניר',
    `${n.he} הזמין/ה אותך להצטרף לקבוצה "${teamName}" בטורניר ${tournamentTitle}`,
    'You were invited to a tournament team',
    `${n.en} invited you to join the team "${teamName}" in ${tournamentTitle}`);
}

const DECISION = {
  APPROVED: (t, tt) => out('הקבוצה אושרה', `הקבוצה "${t}" אושרה להשתתף בטורניר ${tt}`,
    'Team approved', `The team "${t}" was approved to play in ${tt}`),
  REJECTED: (t, tt) => out('הקבוצה נדחתה', `הקבוצה "${t}" לא התקבלה לטורניר ${tt}`,
    'Team declined', `The team "${t}" was not accepted into ${tt}`),
  WAITLISTED: (t, tt) => out('הקבוצה ברשימת המתנה', `הקבוצה "${t}" נמצאת ברשימת המתנה בטורניר ${tt}`,
    'Team on the waitlist', `The team "${t}" is on the waitlist for ${tt}`),
  PENDING: (t, tt) => out('נפתח מקום לקבוצה שלך', `נפתח מקום לקבוצה "${t}" בטורניר ${tt} והיא ממתינה לאישור`,
    'A spot opened for your team', `A spot opened for the team "${t}" in ${tt} and is awaiting approval`),
};

/** Returns null for an unknown status. */
function tournamentTeamDecision({ status, teamName, tournamentTitle }) {
  const build = DECISION[status];
  return build ? build(teamName, tournamentTitle) : null;
}

function tournamentMatchScheduled({ single, count, firstWhen, tournamentTitle, whenText }) {
  if (single) {
    return out('נקבע משחק בטורניר',
      `${single.homeTeam.name} נגד ${single.awayTeam.name} - ${whenText} (${tournamentTitle})`,
      'Tournament match scheduled',
      `${single.homeTeam.name} vs ${single.awayTeam.name} - ${whenText} (${tournamentTitle})`);
  }
  return out('נקבעו משחקים בטורניר',
    `נקבעו ${count} משחקים לקבוצה שלך בטורניר ${tournamentTitle}. המשחק הראשון: ${firstWhen}`,
    'Tournament matches scheduled',
    `${count} matches were scheduled for your team in ${tournamentTitle}. First match: ${firstWhen}`);
}

function tournamentStartingSoon({ homeName, awayName, time, tournamentTitle }) {
  return out('המשחק בטורניר מתחיל בקרוב', `${homeName} נגד ${awayName} מתחיל ב-${time} (${tournamentTitle})`,
    'Your tournament match starts soon', `${homeName} vs ${awayName} starts at ${time} (${tournamentTitle})`);
}

module.exports = {
  formatGameWhen,
  resolveLocation,
  enData,
  describeGame,
  gameJoinedOrganizer,
  gameJoinRequestOrganizer,
  gameWaitlistJoinOrganizer,
  gameWaitlistOffer,
  gameJoinDecision,
  gameCancelled,
  gameRemovedPeer,
  friendJoinedGame,
  friendNewGame,
  newGameInCity,
  newSeriesGame,
  seriesJoinRequest,
  seriesJoinDecision,
  seriesMemberAdded,
  friendRequest,
  friendAccepted,
  tournamentTeamInvite,
  tournamentTeamDecision,
  tournamentMatchScheduled,
  tournamentStartingSoon,
};
