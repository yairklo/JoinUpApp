const SPORT_KEYS = ['SOCCER', 'BASKETBALL', 'TENNIS'];

const HEBREW_SPORT_MAP = {
  'כדורגל': 'SOCCER',
  'רגל': 'SOCCER',
  'כדורסל': 'BASKETBALL',
  'סל': 'BASKETBALL',
  'טניס': 'TENNIS',
};

function resolveSportFilters(q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const lowerQ = query.toLowerCase();
  const matches = new Set(
    SPORT_KEYS.filter((s) => s.toLowerCase().includes(lowerQ))
  );
  for (const [hebrew, enumValue] of Object.entries(HEBREW_SPORT_MAP)) {
    if (hebrew.includes(query) || query.includes(hebrew)) {
      matches.add(enumValue);
    }
  }
  return [...matches];
}

module.exports = { SPORT_KEYS, HEBREW_SPORT_MAP, resolveSportFilters };
