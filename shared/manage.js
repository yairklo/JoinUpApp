// "My management" hub: pure helpers shared by web and mobile for GET /api/manage/overview.
const { formatJerusalemDate, formatJerusalemTime } = require('./timezone');

const DAY_MS = 24 * 60 * 60 * 1000;
/** How many managed items the home feed shows before linking to the full manage screen. */
const MANAGE_HOME_LIMIT = 3;

function compare(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * One list for groups and single games, ordered by the next game that will actually be played.
 * A group has no date of its own, so it sorts by its next game; a group with none scheduled goes last.
 */
function buildManageItems(overview) {
  if (!overview) return [];
  const items = [
    ...overview.groups.map((group) => ({
      kind: 'group',
      key: `g-${group.id}`,
      start: group.nextGame ? Date.parse(group.nextGame.start) : Number.MAX_SAFE_INTEGER,
      group,
    })),
    ...overview.games.map((game) => ({
      kind: 'game',
      key: `m-${game.id}`,
      start: Date.parse(game.start),
      game,
    })),
  ];
  return items.sort((a, b) => compare(a.start, b.start));
}

/**
 * Jerusalem-time description of a game start, for the client to localize:
 * { kind: 'today' | 'tomorrow' | 'weekday', dayOfWeek (0=Sunday), day, month, time: 'HH:MM' }.
 * Returns null for an unparsable start.
 */
function describeStart(startIso, now = new Date()) {
  const date = formatJerusalemDate(startIso);
  if (!date) return null;
  const time = formatJerusalemTime(startIso);
  const [y, m, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  let kind = 'weekday';
  if (date === formatJerusalemDate(now)) kind = 'today';
  else if (date === formatJerusalemDate(new Date(new Date(now).getTime() + DAY_MS))) kind = 'tomorrow';
  return { kind, dayOfWeek, day: d, month: m, time };
}

module.exports = { MANAGE_HOME_LIMIT, buildManageItems, describeStart };
