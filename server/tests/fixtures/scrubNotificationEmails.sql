-- Fixture for prisma/migrations/20261020140000_scrub_notification_emails.
-- Run by scripts/test-scrub-notification-migration.sh against a throwaway Postgres.
CREATE TABLE "Notification" (id serial PRIMARY KEY, title text, body text, data jsonb);
INSERT INTO "Notification" (title, body, data) VALUES
  ('a@b.com hi', 'x', '{"msg":"line1\nnamed@x.co.il ok","q":"say \"hi\" a@b.org","h":"שלום u@e.com","u":"א z@y.com","n":[1,null,{"e":"p@q.io"}]}'),
  ('t', 'b', NULL),
  ('t', 'b', '{}'),
  ('t', 'b', 'null'),
  ('t', 'b', '[]'),
  ('t', 'b', '"s@t.com"'),
  ('t', 'b', '{"keep":"\nnoemail@"}'),
  ('t', 'b', '{"x":"\n@a.bc"}');
