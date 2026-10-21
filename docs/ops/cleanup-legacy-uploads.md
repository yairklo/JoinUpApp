# Cleaning dead legacy `/uploads/` image URLs

Uploads made between 2026-08-20 and 2026-10-18 were stored on the API container's ephemeral disk and
lost on every redeploy. Rows still reference `https://<api>/uploads/...`, which now returns 404.
`server/scripts/cleanLegacyUploadUrls.js` sets those columns to NULL (or drops the entry from an array)
**only when a HEAD request returns 404**. It never deletes rows and is safe to re-run.

Columns: `User.imageUrl`, `GameSeries.imageUrl`, `Game.imageUrl`, `Field.image`, `Field.photos[]`,
`FieldIssueReport.photoUrl`.

## Scope and safeguards

- Only our own files are candidates: absolute URLs on the API host with a path starting `/uploads/`, and
  relative `/uploads/...` values. Anything else containing `/uploads/` (for example a club site's
  `wp-content/uploads`) is reported as "external, untouched" and never requested.
- **Dead means a positive signal.** The server's `/uploads` handler answers a genuinely missing file with
  `404` plus `X-Uploads-Miss: 1`. The script treats a URL as dead only when it sees both. A 404 without the
  header (proxy/Traefik during a redeploy), 429, timeouts and 5xx are "undecided" and never change data.
- **Control check.** Before the HEAD pass and again before any update, the script requests
  `/uploads/__control__/does-not-exist` and requires 404 + the header; otherwise it aborts with nothing changed.
  Each dead URL is re-checked once more after a 2s delay.
- **API host is tied to the environment.** It defaults to the host of `PUBLIC_SERVER_URL`. `--api-host`
  must equal it unless `--allow-other-host` is passed, so relative `/uploads/x` values cannot be resolved
  against the wrong server. The summary prints both the DB host and API host.
- Rate limiting: `/uploads/` is exempt from the read limiter. Default concurrency is 4; 429 is retried
  with backoff honouring `Retry-After`. If URLs stay undecided the script exits with code 2 and says how many;
  just re-run it (idempotent).
- Array columns (`Field.photos`) are updated in small batches (10 rows) inside a transaction with a 30s
  timeout, re-reading each row first so a concurrent change is not overwritten.
- Updates go through Prisma, so `updatedAt` is bumped on cleaned rows.
- Host comparison uses `host[:port]` as printed by the script.

## Requirements

Run it where `DATABASE_URL` and `PUBLIC_SERVER_URL` are set in the process environment (the Coolify
container terminal supplies them; a local `.env` alone is not what production uses).

## Steps

1. Take a DB backup or create a Neon branch of the production database.
2. In the Coolify terminal of the production app, from `server/`, run the dry run (default, changes nothing):
   ```
   node scripts/cleanLegacyUploadUrls.js
   ```
   It prints the database host, per-column counts and up to 5 masked sample URLs.
3. Apply, confirming the database host printed above:
   ```
   CONFIRM_CLEAN_UPLOADS=yes node scripts/cleanLegacyUploadUrls.js --apply --yes-host=<db host>
   ```
   Optional: `--concurrency=4 --timeout-ms=10000 --retries=2`.
4. Read the summary. If it reports undecided URLs (exit code 2), re-run the same command.

The script refuses to run when `NODE_ENV=test`, and `--apply` is refused without both the env var and a
matching `--yes-host`.

Separately, `/uploads/*` misses return an empty 404 (not JSON) so browsers no longer block the image
with `ERR_BLOCKED_BY_ORB` and `onError` fallbacks fire.
