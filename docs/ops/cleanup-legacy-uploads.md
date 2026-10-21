# Cleaning dead legacy `/uploads/` image URLs

Uploads made between 2026-08-20 and 2026-10-18 were stored on the API container's ephemeral disk and
lost on every redeploy. Rows still reference `https://<api>/uploads/...`, which now returns 404.
`server/scripts/cleanLegacyUploadUrls.js` sets those columns to NULL (or drops the entry from an array)
**only when a HEAD request returns 404**. It never deletes rows and is safe to re-run.

Columns: `User.imageUrl`, `GameSeries.imageUrl`, `Game.imageUrl`, `Field.image`, `Field.photos[]`,
`FieldIssueReport.photoUrl`.

## Steps

1. Take a DB backup or create a Neon branch of the production database.
2. In the Coolify terminal of the production app, from `server/`, run the dry run (default, changes nothing):
   ```
   node scripts/cleanLegacyUploadUrls.js
   ```
   It prints the database host, per-column counts and up to 5 masked sample URLs.
3. Apply, confirming the host printed above:
   ```
   CONFIRM_CLEAN_UPLOADS=yes node scripts/cleanLegacyUploadUrls.js --apply --yes-host=<host>
   ```
   Optional: `--concurrency=8 --timeout-ms=10000 --retries=2`.
4. Read the summary. URLs answering 200 or anything other than 404 are left untouched and listed.

The script refuses to run when `NODE_ENV=test`, and `--apply` is refused without both the env var and a
matching `--yes-host`.

Separately, `/uploads/*` misses now return an empty 404 (not JSON) so browsers no longer block the image
with `ERR_BLOCKED_BY_ORB` and `onError` fallbacks fire.
