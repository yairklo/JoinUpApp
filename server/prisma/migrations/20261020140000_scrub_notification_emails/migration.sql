-- Historical notification rows were written before names were redacted, so titles,
-- bodies, and JSON payloads can still contain an account email. Replace every
-- email-shaped token with «משתמש». Serve-time scrubbing covers rows this misses.
UPDATE "Notification"
SET
  title = regexp_replace(title, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'משתמש', 'g'),
  body = regexp_replace(body, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'משתמש', 'g'),
  data = CASE
    WHEN data IS NULL THEN NULL
    ELSE regexp_replace(data::text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'משתמש', 'g')::jsonb
  END
WHERE
  title ~ '@'
  OR body ~ '@'
  OR (data IS NOT NULL AND data::text ~ '@');
