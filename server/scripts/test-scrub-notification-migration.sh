#!/usr/bin/env bash
# Runs the notification email-scrub migration against a throwaway Docker Postgres with
# realistic rows (\n, quotes, Hebrew, unicode escapes, null/empty payloads), twice, and
# fails if any email survives or the second run is not a no-op. Never touches a real DB.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=scrub-mig-test
M=prisma/migrations/20261020140000_scrub_notification_emails/migration.sql
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=p postgres:16 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done
sleep 3
psql_() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
psql_ < tests/fixtures/scrubNotificationEmails.sql
psql_ < "$M"
RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
# Compare decoded string values, not the JSON text (there the n of a newline escape looks like part of an address).
LEFT=$(psql_ -c "select count(*) from \"Notification\" n left join lateral jsonb_path_query(coalesce(n.data,'null'::jsonb), '\$.**') v on jsonb_typeof(v)='string' and (v #>> '{}') ~ '$RE' where n.title ~ '$RE' or v is not null")
[ "$LEFT" = "0" ] || { echo "emails left after migration: $LEFT"; exit 1; }
BEFORE=$(psql_ -c "select md5(string_agg(coalesce(data::text,'')||title, '|' order by id)) from \"Notification\"")
psql_ < "$M"
AFTER=$(psql_ -c "select md5(string_agg(coalesce(data::text,'')||title, '|' order by id)) from \"Notification\"")
[ "$BEFORE" = "$AFTER" ] || { echo "second run changed rows (not idempotent)"; exit 1; }
echo "OK: migration scrubbed all emails, kept escapes valid, and is idempotent"
