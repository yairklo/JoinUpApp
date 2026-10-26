const { SPORT_THEME } = require('./sports');

// Sport -> icon/color for map markers, shared by web (/search) and mobile.
// Colors come from SPORT_THEME.base where the sport has a theme; VOLLEYBALL and PADEL
// are mobile-only sports without a theme entry yet, so they keep their own hex here.
const SPORT_ICON_MAP = {
  SOCCER: 'soccer',
  BASKETBALL: 'basketball',
  TENNIS: 'tennis',
  VOLLEYBALL: 'volleyball',
  PADEL: 'tennis-ball',
};

const EXTRA_SPORT_COLORS = {
  VOLLEYBALL: '#06b6d4',
  PADEL: '#a855f7',
};

const SPORT_COLOR_MAP = {
  ...EXTRA_SPORT_COLORS,
  ...Object.fromEntries(Object.entries(SPORT_THEME).map(([k, v]) => [k, v.base])),
};

const NEUTRAL_MARKER_VISUAL = { iconName: 'stadium', colorHex: '#64748b', variant: 'neutral' };
const EMPTY_FIELD_MARKER_VISUAL = { iconName: 'map-marker-plus', colorHex: '#94a3b8', variant: 'empty' };

function normalizeSportKey(sport) {
  if (!sport) return null;
  const upper = String(sport).toUpperCase();
  if (SPORT_ICON_MAP[upper]) return upper;

  const lower = String(sport).toLowerCase();
  if (lower.includes('כדורסל') || lower.includes('basketball')) return 'BASKETBALL';
  if (lower.includes('טניס') || lower.includes('tennis')) return 'TENNIS';
  if (lower.includes('כדורעף') || lower.includes('volleyball')) return 'VOLLEYBALL';
  if (lower.includes('פדל') || lower.includes('padel')) return 'PADEL';
  if (lower.includes('כדורגל') || lower.includes('soccer') || lower.includes('football')) return 'SOCCER';
  return null;
}

function normalizeSupportedSports(supportedSports) {
  const seen = new Set();
  const normalized = [];
  for (const sport of supportedSports || []) {
    const key = normalizeSportKey(sport);
    if (key && !seen.has(key)) {
      seen.add(key);
      normalized.push(key);
    }
  }
  return normalized;
}

/** Sport tags derived solely from venue DB metadata — never from form state. */
function getFieldSportTags(field) {
  return normalizeSupportedSports(field && field.supportedSports);
}

/** No filter = match everything; a multi-sport field matches if any tag equals the filter. */
function fieldMatchesSportFilter(field, filter) {
  if (!filter) return true;
  return getFieldSportTags(field).includes(filter);
}

function getSportIconName(sport) {
  const key = normalizeSportKey(sport);
  return key ? SPORT_ICON_MAP[key] : 'map-marker';
}

function getSportColorHex(sport) {
  const key = normalizeSportKey(sport);
  return key ? SPORT_COLOR_MAP[key] : '#059669';
}

function getSportMarkerVisual(sport) {
  const key = normalizeSportKey(sport);
  if (!key) return NEUTRAL_MARKER_VISUAL;
  return { iconName: SPORT_ICON_MAP[key], colorHex: SPORT_COLOR_MAP[key], variant: 'sport' };
}

/**
 * Icon is derived exclusively from the venue's supportedSports DB field.
 * Form/screen sport context is intentionally ignored.
 */
function getFieldMarkerVisual(field) {
  const supported = getFieldSportTags(field);
  if (supported.length === 1) return getSportMarkerVisual(supported[0]);
  return NEUTRAL_MARKER_VISUAL;
}

module.exports = {
  NEUTRAL_MARKER_VISUAL,
  EMPTY_FIELD_MARKER_VISUAL,
  normalizeSportKey,
  getFieldSportTags,
  fieldMatchesSportFilter,
  getSportIconName,
  getSportColorHex,
  getSportMarkerVisual,
  getFieldMarkerVisual,
};
