/**
 * Hebrew/English city spellings that should be treated as the same place.
 * Canonical values match Field.city as stored in the DB (Hebrew official names).
 */

const DEFAULT_CITY = 'תל אביב-יפו';

const CITY_ALIASES = {
  'תל אביב': DEFAULT_CITY,
  'Tel Aviv': DEFAULT_CITY,
  'Tel Aviv-Yafo': DEFAULT_CITY,
};

// Case-insensitive lookup so e.g. "tel aviv" / "TEL AVIV" resolve the same alias as "Tel Aviv" --
// matches the DB-side comparison (Prisma `mode: 'insensitive'`), so a live socket event carrying
// a differently-cased city isn't silently dropped by this client-side predicate while the REST
// fetch (which goes through the DB's case-insensitive match) would have included it.
const CITY_ALIASES_LOWER = Object.fromEntries(
  Object.entries(CITY_ALIASES).map(([alias, canonical]) => [alias.toLowerCase(), canonical])
);

function normalizeCity(city) {
  const trimmed = String(city || '').trim();
  if (!trimmed) return '';
  return CITY_ALIASES[trimmed] || CITY_ALIASES_LOWER[trimmed.toLowerCase()] || trimmed;
}

function expandCityAliases(city) {
  const canonical = normalizeCity(city);
  if (!canonical) return [];
  const aliases = Object.entries(CITY_ALIASES)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias);
  return Array.from(new Set([canonical, ...aliases]));
}

function allCityTokensFor(city) {
  return expandCityAliases(city);
}

/** Prisma nested `field` filter: exact city, or OR of aliases (insensitive). */
function prismaFieldCityFilter(city) {
  const aliases = expandCityAliases(city);
  if (aliases.length === 0) return {};
  if (aliases.length === 1) {
    return { city: { equals: aliases[0], mode: 'insensitive' } };
  }
  return {
    OR: aliases.map((alias) => ({ city: { equals: alias, mode: 'insensitive' } })),
  };
}

function sqlEscapeLiteral(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * SQL expression that maps alias spellings to the canonical city name.
 * `column` must be a trusted identifier (never user input), e.g. `f.city`.
 */
function sqlCanonicalCityExpr(column) {
  const groups = {};
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    (groups[canonical] ||= new Set()).add(alias);
    groups[canonical].add(canonical);
  }
  const whens = Object.entries(groups).map(([canonical, set]) => {
    const list = [...set].map((s) => `'${sqlEscapeLiteral(s)}'`).join(', ');
    return `WHEN ${column} IN (${list}) THEN '${sqlEscapeLiteral(canonical)}'`;
  });
  if (whens.length === 0) return column;
  return `CASE ${whens.join(' ')} ELSE ${column} END`;
}

module.exports = {
  DEFAULT_CITY,
  CITY_ALIASES,
  normalizeCity,
  expandCityAliases,
  allCityTokensFor,
  prismaFieldCityFilter,
  sqlCanonicalCityExpr,
};
