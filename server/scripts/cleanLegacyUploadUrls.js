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
 * Usage (from server/, e.g. the Coolify terminal of the production app):
 *   1. Take a DB backup / Neon branch first.
 *   2. Dry run (default, changes nothing):
 *        node scripts/cleanLegacyUploadUrls.js
 *      It prints the database host; note it.
 *   3. Apply:
 *        CONFIRM_CLEAN_UPLOADS=yes node scripts/cleanLegacyUploadUrls.js --apply \
 *          --yes-host=<that host> --api-host=joinup-api.duckdns.org
 *
 * Before deleting anything --apply checks https://<api-host>/api/health is 200 (control check),
 * aborts if every checked URL (more than 20) is 404 unless --force-all-dead, and re-checks each 404 once
 * more right before updating.
 *
 * Options: --api-host=<host> (required for --apply; the dry run defaults to joinup-api.duckdns.org and
 * the PUBLIC_SERVER_URL host), --force-all-dead, --concurrency=<n> (default 8), --timeout-ms=<n> (default 10000), --retries=<n> (default 2).
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
    return new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Classify a stored value. Returns { kind: 'own', url } for our own legacy files (url is absolute),
 * { kind: 'external' } for any other value containing /uploads/, or null when not relevant.
 * apiHosts: Set of lowercase hostnames; primaryHost resolves relative values.
 */
function classifyUrl(value, apiHosts, primaryHost) {
  if (!isLegacyUploadUrl(value)) return null;
  if (value.startsWith(MARKER)) return { kind: 'own', url: `https://${primaryHost}${value}` };
  try {
    const u = new URL(value);
    if (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      apiHosts.has(u.hostname.toLowerCase()) &&
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

/** Host only (no credentials, port, or database name) of a Postgres connection string. */
function dbHostFromUrl(connectionString) {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).hostname || null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const opts = { apply: false, yesHost: null, apiHost: null, forceAllDead: false, concurrency: 8, timeoutMs: 10000, retries: 2 };
  for (const a of argv) {
    if (a === '--apply') opts.apply = true;
    else if (a.startsWith('--yes-host=')) opts.yesHost = a.slice('--yes-host='.length);
    else if (a.startsWith('--api-host=')) opts.apiHost = hostOf(a.slice('--api-host='.length));
    else if (a === '--force-all-dead') opts.forceAllDead = true;
    else if (a.startsWith('--concurrency=')) opts.concurrency = Math.max(1, parseInt(a.split('=')[1], 10) || 8);
    else if (a.startsWith('--timeout-ms=')) opts.timeoutMs = Math.max(1, parseInt(a.split('=')[1], 10) || 10000);
    else if (a.startsWith('--retries=')) opts.retries = Math.max(0, parseInt(a.split('=')[1], 10) || 0);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

/** Returns an error message when the run must be refused, otherwise null. */
function checkSafety({ env, opts, host }) {
  if (env.NODE_ENV === 'test') return 'Refusing to run when NODE_ENV=test.';
  if (!host) return 'Could not determine the database host from DATABASE_URL.';
  if (opts.apply) {
    if (env.CONFIRM_CLEAN_UPLOADS !== 'yes') return '--apply requires CONFIRM_CLEAN_UPLOADS=yes.';
    if (opts.yesHost !== host) return `--apply requires --yes-host=${host} (confirms the target database).`;
    if (!opts.apiHost) return '--apply requires --api-host=<public API host> (e.g. joinup-api.duckdns.org).';
  }
  return null;
}

/** Only a real 404 marks a URL dead. 200, 5xx, errors, etc. are never cleaned. */
function isDeadStatus(status) {
  return status === 404;
}

/**
 * Collect legacy URLs from column values (scalar or array).
 * Returns { own: Map(storedValue -> {url, count}), external: number of external values }.
 */
function collectLegacyUrls(values, apiHosts, primaryHost) {
  const own = new Map();
  let external = 0;
  for (const v of values) {
    const list = Array.isArray(v) ? v : [v];
    for (const item of list) {
      const c = classifyUrl(item, apiHosts, primaryHost);
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

/** Abort reason when HEAD results look like a proxy/deploy outage rather than dead files, else null. */
function allDeadAbort(statuses, forceAllDead) {
  if (forceAllDead) return null;
  if (statuses.length > 20 && statuses.every((s) => s === 404)) {
    return `All ${statuses.length} checked URLs returned 404. This looks like a proxy/deploy problem; aborting. Re-run later or pass --force-all-dead if you are sure.`;
  }
  return null;
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

/** HEAD with timeout and retries. Returns an HTTP status number, 'relative', or 'error'. */
async function headStatus(url, { timeoutMs, retries, fetchImpl = fetch }, method = 'HEAD') {
  if (!/^https?:\/\//i.test(url)) return 'relative';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { method, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (res.status < 500) return res.status;
    } catch {
      // network error / timeout: retry
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return 'error';
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
  for (const batch of chunk(rows, batchSize)) {
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
    });
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
  const primaryHost = opts.apiHost || publicHost || DEFAULT_API_HOST;
  const apiHosts = new Set(opts.apply ? [opts.apiHost] : [DEFAULT_API_HOST, publicHost, opts.apiHost].filter(Boolean));
  console.log(`Database host: ${host}`);
  console.log(`API host(s) treated as ours: ${[...apiHosts].join(', ')}`);
  console.log(opts.apply ? 'Mode: APPLY' : 'Mode: DRY RUN (no changes; pass --apply to modify)');

  try {
    const loaded = [];
    for (const t of TARGETS) {
      const rows = await loadColumn(prisma, t);
      const { own, external } = collectLegacyUrls(rows.map((r) => r[t.column]), apiHosts, primaryHost);
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

    // Control check: the public API must be reachable, otherwise every file would look dead.
    const healthUrl = `https://${opts.apiHost}/api/health`;
    const health = await headStatus(healthUrl, opts, 'GET');
    if (health !== 200) {
      console.error(`Control check failed: GET ${healthUrl} returned ${health}. Aborting, nothing changed.`);
      process.exit(1);
    }
    console.log(`Control check OK: ${healthUrl} -> 200`);

    // storedValue -> absolute url, across all columns
    const urlByValue = new Map();
    for (const { own } of loaded) for (const [v, { url }] of own) urlByValue.set(v, url);
    const values = [...urlByValue.keys()];
    console.log(`Checking ${values.length} distinct URLs with HEAD...`);
    const statuses = await mapLimit(values, opts.concurrency, (v) => headStatus(urlByValue.get(v), opts));
    const tally = {};
    for (const st of statuses) tally[st] = (tally[st] || 0) + 1;
    console.log('HEAD results:', JSON.stringify(tally));
    const abort = allDeadAbort(statuses, opts.forceAllDead);
    if (abort) {
      console.error(abort);
      process.exit(1);
    }

    // Second HEAD right before updating; still 404 required.
    const first404 = values.filter((_, i) => isDeadStatus(statuses[i]));
    const second = await mapLimit(first404, opts.concurrency, (v) => headStatus(urlByValue.get(v), opts));
    const deadSet = new Set(first404.filter((_, i) => isDeadStatus(second[i])));
    console.log(`${first404.length} URLs were 404; ${deadSet.size} still 404 on recheck.`);

    let total = 0;
    for (const { t, own } of loaded) {
      const deadHere = [...own.keys()].filter((u) => deadSet.has(u));
      const n = deadHere.length ? await applyTarget(prisma, t, deadHere) : 0;
      total += n;
      console.log(`${t.table}.${t.column}: cleaned ${n} rows`);
    }
    const kept = values.length - deadSet.size;
    console.log(`Summary: ${deadSet.size} dead URLs cleaned (${total} rows updated); ${kept} URLs left untouched (non-404 or flaky).`);
    for (const v of values.filter((x) => !deadSet.has(x)).slice(0, 10)) {
      console.log(`  untouched ${maskUrl(v)}`);
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
  allDeadAbort,
  DEFAULT_API_HOST,
  maskUrl,
  dbHostFromUrl,
  parseArgs,
  checkSafety,
  isDeadStatus,
  collectLegacyUrls,
  pruneArray,
  chunk,
  mapLimit,
  headStatus,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
