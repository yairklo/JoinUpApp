-- Historical notification rows were written before names were redacted, so titles,
-- bodies, and JSON payloads can still contain an account email. Replace every
-- email-shaped token with «משתמש». Serve-time scrubbing covers rows this misses.
--
-- The JSON payload is rewritten value by value (never as a text blob), so JSON
-- escapes such as \n or א can never be split and the result is always valid jsonb.
-- Idempotent: rows with no email are not touched, and a second run changes nothing.
-- Non-destructive for everything except the email tokens themselves.
--
-- BACK UP FIRST (see server/docs/agents/database_rules.md):
--   pg_dump --table='"Notification"' --data-only "$DIRECT_URL" > notification-backup.sql

CREATE FUNCTION pg_temp.scrub_email_json(j jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  result jsonb;
  k text;
  v jsonb;
BEGIN
  CASE jsonb_typeof(j)
    WHEN 'string' THEN
      RETURN to_jsonb(regexp_replace(j #>> '{}', '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'משתמש', 'g'));
    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(pg_temp.scrub_email_json(e.value) ORDER BY e.ord), '[]'::jsonb)
        INTO result
        FROM jsonb_array_elements(j) WITH ORDINALITY AS e(value, ord);
      RETURN result;
    WHEN 'object' THEN
      result := '{}'::jsonb;
      FOR k, v IN SELECT key, value FROM jsonb_each(j) LOOP
        result := result || jsonb_build_object(k, pg_temp.scrub_email_json(v));
      END LOOP;
      RETURN result;
    ELSE
      RETURN j;
  END CASE;
END
$fn$;

UPDATE "Notification"
SET
  title = regexp_replace(title, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'משתמש', 'g'),
  body = regexp_replace(body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'משתמש', 'g'),
  data = CASE WHEN data IS NULL THEN NULL ELSE pg_temp.scrub_email_json(data) END
WHERE
  title ~ '@'
  OR body ~ '@'
  OR (data IS NOT NULL AND data::text ~ '@');
