/**
 * Clean dead legacy /uploads/ image URLs from the database.
 *
 * Between 2026-08-20 and 2026-10-18 uploads lived on the API container's ephemeral disk and were
 * wiped on every redeploy. Rows still point at https://<api>/uploads/<sub>/<uuid>.<ext>, which now
 * 404. This script NULLs scalar columns (or removes array entries) whose URL really returns 404.
 * It never deletes rows, is idempotent, and leaves URLs that answer 200 (or anything else) alone.
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
 *        CONFIRM_CLEAN_UPLOADS=yes node scripts/cleanLegacyUploadUrls.js --apply --yes-host=<that host>
 *
 * Options: --concurrency=<n> (default 8), --timeout-ms=<n> (default 10000), --retries=<n> (default 2).
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

function isLegacyUploadUrl(v) {
  return typeof v === 'string' && v.includes(MARKER);
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
  const opts = { apply: false, yesHost: null, concurrency: 8, timeoutMs: 10000, retries: 2 };
  for (const a of argv) {
    if (a === '--apply') opts.apply = true;
    else if (a.startsWith('--yes-host=')) opts.yesHost = a.slice('--yes-host='.length);
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
  }
  return null;
}

/** Only a real 404 marks a URL dead. 200, 5xx, errors, etc. are never cleaned. */
function isDeadStatus(status) {
  return status === 404;
}

/** Collect {url -> count} of legacy URLs from a list of column values (scalar or array). */
function collectLegacyUrls(values) {
  const counts = new Map();
  for (const v of values) {
    const list = Array.isArray(v) ? v : [v];
    for (const u of list) {
      if (isLegacyUploadUrl(u)) counts.set(u, (counts.get(u) || 0) + 1);
    }
  }
  return counts;
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
async function headStatus(url, { timeoutMs, retries, fetchImpl = fetch }) {
  if (!/^https?:\/\//i.test(url)) return 'relative';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
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
    const ops = [];
    for (const r of batch) {
      const next = pruneArray(r[t.column], deadSet);
      if (next) ops.push(prisma[t.model].update({ where: { id: r.id }, data: { [t.column]: next } }));
    }
    if (ops.length) {
      await prisma.$transaction(ops);
      changed += ops.length;
    }
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
  console.log(`Database host: ${host}`);
  console.log(opts.apply ? 'Mode: APPLY' : 'Mode: DRY RUN (no changes; pass --apply to modify)');

  try {
    const loaded = [];
    for (const t of TARGETS) {
      const rows = await loadColumn(prisma, t);
      const counts = collectLegacyUrls(rows.map((r) => r[t.column]));
      loaded.push({ t, rows, counts });
      const samples = [...counts.keys()].slice(0, 5).map(maskUrl);
      console.log(
        `${t.table}.${t.column}: ${rows.length} rows, ${counts.size} distinct legacy URLs` +
          (samples.length ? `\n    samples: ${samples.join(', ')}` : ''),
      );
    }
    if (!opts.apply) {
      console.log('Dry run complete. Nothing changed.');
      return;
    }

    const allUrls = [...new Set(loaded.flatMap((l) => [...l.counts.keys()]))];
    console.log(`Checking ${allUrls.length} distinct URLs with HEAD...`);
    const statuses = await mapLimit(allUrls, opts.concurrency, (u) => headStatus(u, opts));
    const statusByUrl = new Map(allUrls.map((u, i) => [u, statuses[i]]));
    const tally = {};
    for (const s of statuses) tally[s] = (tally[s] || 0) + 1;
    console.log('HEAD results:', JSON.stringify(tally));
    const dead = allUrls.filter((u) => isDeadStatus(statusByUrl.get(u)));

    let total = 0;
    for (const { t, counts } of loaded) {
      const deadHere = [...counts.keys()].filter((u) => isDeadStatus(statusByUrl.get(u)));
      const n = deadHere.length ? await applyTarget(prisma, t, deadHere) : 0;
      total += n;
      console.log(`${t.table}.${t.column}: cleaned ${n} rows`);
    }
    const kept = allUrls.length - dead.length;
    console.log(`Summary: ${dead.length} dead URLs cleaned (${total} rows updated); ${kept} URLs left untouched (non-404).`);
    for (const u of allUrls.filter((x) => !isDeadStatus(statusByUrl.get(x))).slice(0, 10)) {
      console.log(`  untouched [${statusByUrl.get(u)}] ${maskUrl(u)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  TARGETS,
  isLegacyUploadUrl,
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
