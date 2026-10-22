/**
 * Clean dead legacy /uploads/ image URLs from the database.
 *
 * Between 2026-08-20 and 2026-10-18 uploads lived on the API container's ephemeral disk and were
 * wiped on every redeploy. Rows still point at https://<api>/uploads/<sub>/<uuid>.<ext>, which now
 * 404. This script NULLs scalar columns (or removes array entries) whose URL really returns 404.
 * It never deletes rows, is idempotent, and leaves URLs that answer 200 (or anything else) alone.
 *
 * Only OUR OWN legacy files are candidates: absolute URLs whose host is the API host and whose path
 * starts with /uploads/, plus relative /uploads/... values (resolved against the API host). Any other
 * URL containing "/uploads/" (a club site's wp-content/uploads, etc.) is counted as
 * "external, untouched" and never requested or modified.
 *
 * Columns covered: User.imageUrl, GameSeries.imageUrl, Game.imageUrl, Field.image,
 * Field.photos (array), FieldIssueReport.photoUrl.
 *
 * Deadness is a POSITIVE signal: a URL is dead only when the API answers 404 AND the response carries
 * `X-Uploads-Miss: 1` (sent by the /uploads handler for a genuinely missing file). A 404 from a proxy
 * during a redeploy has no such header and is reported as undecided. 429/timeouts are undecided too.
 *
 * Usage (from server/, e.g. the Coolify terminal of the production app, which supplies DATABASE_URL and
 * PUBLIC_SERVER_URL in its environment):
 *   1. Take a DB backup / Neon branch first.
 *   2. Dry run (default, changes nothing):
 *        node scripts/cleanLegacyUploadUrls.js
 *      It prints the database host; note it.
 *   3. Apply:
 *        CONFIRM_CLEAN_UPLOADS=yes node scripts/cleanLegacyUploadUrls.js --apply --yes-host=<that host>
 *
 * The API host defaults to the host of PUBLIC_SERVER_URL. --api-host=<host> must equal it, unless
 * --allow-other-host is passed. --apply probes https://<api-host>/uploads/__control__/does-not-exist
 * (must be 404 + header) before the HEAD pass and again before any update, and re-checks each dead URL
 * once more after a short delay.
 *
 * Options: --api-host=<host>, --allow-other-host, --concurrency=<n> (default 4), --timeout-ms=<n>
 * (default 10000), --retries=<n> (default 2).
 * Refuses to run when NODE_ENV=test. See docs/ops/cleanup-legacy-uploads.md.
 */

const MARKER = '/uploads/';

// kind 'scalar' -> column is String?; 'array' -> String[]
const TARGETS = [
  { model: 'user', table: 'User', column: 'imageUrl', kind: 'scalar' },
  { model: 'gameSeries', table: 'GameSeries', column: 'imageUrl', kind: 'scalar' },
  { model: 'game', table: 'Game', column: 'imageUrl', kind: 'scalar' },
  { model: 'field', table: 'Field', column: 'image', kind: 'scalar' },
  { model: 'field', table: 'Field', column: 'photos', kind: 'array' },
  { model: 'fieldIssueReport', table: 'FieldIssueReport', column: 'photoUrl', kind: 'scalar' },
];

const DEFAULT_API_HOST = 'joinup-api.duckdns.org';

function isLegacyUploadUrl(v) {
  return typeof v === 'string' && v.includes(MARKER);
}

function hostOf(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify a stored value. Returns { kind: 'own', url } for our own legacy files (url is absolute),
 * { kind: 'external' } for any other value containing /uploads/, or null when not relevant.
 * apiHosts: Set of lowercase hostnames; primaryHost resolves relative values.
 */
function classifyUrl(value, apiHosts, primaryHost, scheme = 'https') {
  if (!isLegacyUploadUrl(value)) return null;
  if (value.startsWith(MARKER)) return { kind: 'own', url: `${scheme}://${primaryHost}${value}` };
  try {
    const u = new URL(value);
    if (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      apiHosts.has(u.host.toLowerCase()) &&
      u.pathname.startsWith(MARKER)
    ) {
      return { kind: 'own', url: value };
    }
  } catch {
    // not a parseable URL: treat as external
  }
  return { kind: 'external' };
}

/** Masks the file name so samples never expose full paths: https://host/uploads/ab….ext */
function maskUrl(url) {
  if (typeof url !== 'string') return '';
  const i = url.indexOf(MARKER);
  if (i < 0) return url.slice(0, 12) + '…';
  const head = url.slice(0, i + MARKER.length);
  const tail = url.slice(i + MARKER.length);
  const ext = tail.includes('.') ? tail.slice(tail.lastIndexOf('.')) : '';
  return `${head}${tail.slice(0, 2)}…${ext}`;
}

/** host[:port] (no credentials or database name) of a Postgres connection string. */
function dbHostFromUrl(connectionString) {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).host || null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const opts = { apply: false, yesHost: null, apiHost: null, allowOtherHost: false, concurrency: 4, timeoutMs: 10000, retries: 2 };
  for (const a of argv) {
    if (a === '--apply') opts.apply = true;
    else if (a.startsWith('--yes-host=')) opts.yesHost = a.slice('--yes-host='.length);
    else if (a.startsWith('--api-host=')) opts.apiHost = hostOf(a.slice('--api-host='.length));
    else if (a === '--allow-other-host') opts.allowOtherHost = true;
    else if (a.startsWith('--concurrency=')) opts.concurrency = Math.max(1, parseInt(a.split('=')[1], 10) || 4);
    else if (a.startsWith('--timeout-ms=')) opts.timeoutMs = Math.max(1, parseInt(a.split('=')[1], 10) || 10000);
    else if (a.startsWith('--retries=')) opts.retries = Math.max(0, parseInt(a.split('=')[1], 10) || 0);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

/** The API host this run talks to: --api-host, else the host of PUBLIC_SERVER_URL. */
function resolveApiHost(env, opts) {
  return opts.apiHost || hostOf(env.PUBLIC_SERVER_URL);
}

/** Returns an error message when the run must be refused, otherwise null. */
function checkSafety({ env, opts, host }) {
  if (env.NODE_ENV === 'test') return 'Refusing to run when NODE_ENV=test.';
  if (!host) return 'Could not determine the database host from DATABASE_URL.';
  if (opts.apply) {
    if (env.CONFIRM_CLEAN_UPLOADS !== 'yes') return '--apply requires CONFIRM_CLEAN_UPLOADS=yes.';
    if (opts.yesHost !== host) return `--apply requires --yes-host=${host} (confirms the target database).`;
    const apiHost = resolveApiHost(env, opts);
    if (!apiHost) return '--apply requires PUBLIC_SERVER_URL in the environment (or --api-host=<host> with --allow-other-host).';
    const envHost = hostOf(env.PUBLIC_SERVER_URL);
    if (opts.apiHost && opts.apiHost !== envHost && !opts.allowOtherHost) {
      return `--api-host=${opts.apiHost} differs from PUBLIC_SERVER_URL host (${envHost || 'unset'}). Pass --allow-other-host only if you are sure it serves this database's files.`;
    }
  }
  return null;
}

/**
 * Verdict for a probe result { status, miss }:
 *  dead      - 404 with X-Uploads-Miss (the only thing that ever leads to a change)
 *  proxy404  - 404 without the header (proxy / deploy hiccup): undecided
 *  undecided - 429, timeout or other failure (status null)
 *  alive     - anything else (200, redirects, ...): left untouched
 */
function verdict(p) {
  if (!p || p.status == null || p.status === 429 || p.status >= 500) return 'undecided';
  if (p.status === 404) return p.miss ? 'dead' : 'proxy404';
  return 'alive';
}

/**
 * Collect legacy URLs from column values (scalar or array).
 * Returns { own: Map(storedValue -> {url, count}), external: number of external values }.
 */
function collectLegacyUrls(values, apiHosts, primaryHost, scheme = 'https') {
  const own = new Map();
  let external = 0;
  for (const v of values) {
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      const c = classifyUrl(item, apiHosts, primaryHost, scheme);
      if (!c) continue;
      if (c.kind === 'external') {
        external++;
      } else {
        const prev = own.get(item);
        own.set(item, { url: c.url, count: prev ? prev.count + 1 : 1 });
      }
    }
  }
  return { own, external };
}

/** Array column: drop entries whose URL is in deadSet. Returns null when nothing changes. */
function pruneArray(arr, deadSet) {
  if (!Array.isArray(arr)) return null;
  const next = arr.filter((u) => !deadSet.has(u));
  return next.length === arr.length ? null : next;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_429_RETRIES = 4;

/**
 * One request with timeout and retries. Returns { status, miss } where status is null when no usable
 * response was obtained. 429 is retried with backoff honouring Retry-After (max 30s per wait).
 */
async function probe(url, { timeoutMs, retries, fetchImpl = fetch, sleep = defaultSleep }, method = 'HEAD') {
  let last = { status: null, miss: false };
  let rateLimited = 0;
  for (let attempt = 0; attempt <= retries; ) {
    try {
      const res = await fetchImpl(url, { method, signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
      const miss = !!(res.headers && res.headers.get && res.headers.get('x-uploads-miss'));
      last = { status: res.status, miss };
      if (res.status === 429) {
        if (++rateLimited > MAX_429_RETRIES) return last;
        const ra = parseInt((res.headers && res.headers.get && res.headers.get('retry-after')) || '', 10);
        await sleep(Math.min(30000, (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * rateLimited)));
        continue;
      }
      if (res.status < 500) return last;
    } catch {
      last = { status: null, miss: false };
    }
    attempt++;
    if (attempt <= retries) await sleep(300 * attempt);
  }
  return last;
}

/** The control path must answer a genuine uploads miss (404 + header); proves the API itself is answering. */
async function controlCheck(apiHost, opts, scheme = 'https') {
  const url = `${scheme}://${apiHost}/uploads/__control__/does-not-exist`;
  const p = await probe(url, opts);
  return { ok: verdict(p) === 'dead', url, p };
}

async function loadColumn(prisma, t) {
  const where =
    t.kind === 'scalar'
      ? { [t.column]: { contains: MARKER } }
      : { [t.column]: { isEmpty: false } };
  const rows = await prisma[t.model].findMany({ where, select: { id: true, [t.column]: true } });
  return rows.filter((r) => {
    const v = r[t.column];
    return Array.isArray(v) ? v.some(isLegacyUploadUrl) : isLegacyUploadUrl(v);
  });
}

async function applyTarget(prisma, t, deadUrls, batchSize = 50) {
  const arrayBatch = 10;
  const deadSet = new Set(deadUrls);
  let changed = 0;
  if (t.kind === 'scalar') {
    for (const batch of chunk(deadUrls, batchSize)) {
      const r = await prisma[t.model].updateMany({
        where: { [t.column]: { in: batch } },
        data: { [t.column]: null },
      });
      changed += r.count;
    }
    return changed;
  }
  const rows = await loadColumn(prisma, t);
  for (const batch of chunk(rows, arrayBatch)) {
    // Re-read each row inside the transaction so a concurrent change to the array is not overwritten.
    changed += await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const r of batch) {
        const fresh = await tx[t.model].findUnique({ where: { id: r.id }, select: { [t.column]: true } });
        const next = fresh ? pruneArray(fresh[t.column], deadSet) : null;
        if (next) {
          await tx[t.model].update({ where: { id: r.id }, data: { [t.column]: next } });
          n++;
        }
      }
      return n;
    }, { maxWait: 10000, timeout: 30000 });
  }
  return changed;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const host = dbHostFromUrl(process.env.DATABASE_URL);
  const problem = checkSafety({ env: process.env, opts, host });
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  const { prisma } = require('../lib/prisma');
  const publicHost = hostOf(process.env.PUBLIC_SERVER_URL);
  const apiHost = resolveApiHost(process.env, opts);
  const primaryHost = apiHost || DEFAULT_API_HOST;
  // Scheme follows PUBLIC_SERVER_URL (https in production; http only for local rehearsals).
  const scheme = /^http:/i.test(process.env.PUBLIC_SERVER_URL || '') ? 'http' : 'https';
  const apiHosts = new Set(opts.apply ? [apiHost] : [DEFAULT_API_HOST, publicHost, opts.apiHost].filter(Boolean));
  console.log(`Database host: ${host}`);
  console.log(`API host(s) treated as ours: ${[...apiHosts].join(', ')}`);
  console.log(opts.apply ? 'Mode: APPLY' : 'Mode: DRY RUN (no changes; pass --apply to modify)');

  try {
    const loaded = [];
    for (const t of TARGETS) {
      const rows = await loadColumn(prisma, t);
      const { own, external } = collectLegacyUrls(rows.map((r) => r[t.column]), apiHosts, primaryHost, scheme);
      loaded.push({ t, own });
      const samples = [...own.keys()].slice(0, 5).map(maskUrl);
      console.log(
        `${t.table}.${t.column}: ${own.size} distinct own legacy URLs, ${external} external values (untouched)` +
          (samples.length ? `\n    samples: ${samples.join(', ')}` : ''),
      );
    }
    if (!opts.apply) {
      console.log('Dry run complete. Nothing changed.');
      return;
    }

    const requireControl = async (when) => {
      const c = await controlCheck(apiHost, opts, scheme);
      if (!c.ok) {
        console.error(`Control check failed ${when}: ${c.url} returned status ${c.p.status} (X-Uploads-Miss: ${c.p.miss ? 'yes' : 'no'}). Aborting before any change.`);
        process.exit(1);
      }
      console.log(`Control check OK ${when}.`);
    };
    await requireControl('before HEAD pass');

    // storedValue -> absolute url, across all columns
    const urlByValue = new Map();
    for (const { own } of loaded) for (const [v, { url }] of own) urlByValue.set(v, url);
    const values = [...urlByValue.keys()];
    console.log(`Checking ${values.length} distinct URLs with HEAD (concurrency ${opts.concurrency})...`);
    const probes = await mapLimit(values, opts.concurrency, (v) => probe(urlByValue.get(v), opts));
    const verdicts = probes.map(verdict);
    const tally = {};
    for (const v of verdicts) tally[v] = (tally[v] || 0) + 1;
    console.log('Results:', JSON.stringify(tally));

    // Recheck dead ones after a short delay; both probes must say dead.
    const first = values.filter((_, i) => verdicts[i] === 'dead');
    await defaultSleep(2000);
    const second = await mapLimit(first, opts.concurrency, (v) => probe(urlByValue.get(v), opts));
    const dead = new Set(first.filter((_, i) => verdict(second[i]) === 'dead'));
    console.log(`${first.length} URLs dead on first pass; ${dead.size} still dead on recheck.`);

    await requireControl('before updating');

    let total = 0;
    for (const { t, own } of loaded) {
      const deadHere = [...own.keys()].filter((u) => dead.has(u));
      const n = deadHere.length ? await applyTarget(prisma, t, deadHere) : 0;
      total += n;
      console.log(`${t.table}.${t.column}: cleaned ${n} rows`);
    }
    const undecided = values.length - dead.size - verdicts.filter((v) => v === 'alive').length;
    console.log(
      `Summary: database ${host}, API ${apiHost}. ${dead.size} dead URLs cleaned (${total} rows updated, updatedAt bumped); ` +
        `${verdicts.filter((v) => v === 'alive').length} alive (untouched); ${undecided} undecided (429/timeout/proxy 404/flaky).`,
    );
    if (undecided > 0) {
      console.log(`${undecided} URLs undecided: re-run the script (it is idempotent) to finish them.`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  TARGETS,
  isLegacyUploadUrl,
  hostOf,
  classifyUrl,
  DEFAULT_API_HOST,
  maskUrl,
  dbHostFromUrl,
  parseArgs,
  checkSafety,
  verdict,
  resolveApiHost,
  collectLegacyUrls,
  pruneArray,
  chunk,
  mapLimit,
  probe,
  controlCheck,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
