# Dev seed

`server/scripts/seedDev.js` resets and rewrites a fixed dataset on the **dev** database. It is idempotent: run it again and the same rows are replaced. It does not drop unrelated data.

The script does **not** read `server/.env` or `server/.env.development`. Put the variables in the shell, or pass one explicit file:

```bash
npm run seed:dev -- --env-file /path/to/dev.env
```

Shell exports win over that file. `lib/prisma.js` skips its own dotenv load when the seed sets `JOINUP_SKIP_DOTENV=1`, so the Prisma client cannot pick up a production URL from `server/.env` either. `prisma migrate deploy` still loads `server/.env` for **unset** variables; export both database URLs before running so that file cannot fill one of them in.

It refuses to start when any of these are true:

- `CLERK_SECRET_KEY` is missing or is not `sk_test_…`
- any Clerk key in the environment is `pk_live_` / `sk_live_`
- `DATABASE_URL` or `DIRECT_DATABASE_URL` is missing
- those two URLs are not the same database once `-pooler` is removed from the host (`ep-name-pooler.region…` and `ep-name.region…` are the same Neon endpoint)
- `DIRECT_DATABASE_URL` still points at a `-pooler` host
- either URL's host matches `PROD_DATABASE_URL` after the same `-pooler` strip (the raw strings do not have to be equal)
- either URL's host or database name looks like production (`prod` / `production` as a whole token)
- `PUBLIC_SERVER_URL` is `https://joinup-api.duckdns.org`
- the host is remote and `SEED_ALLOWED_DB_HOST` is missing or differs from that canonical host
- the host is remote, has no whole-token `dev` / `preview` / `staging` / `test` / `branch` / `ci` label, and `JOINUP_SEED_CONFIRM=dev` is not set
- the host is remote and `joinup_dev_seed_marker` does not contain `id = 'dev'` for that canonical host

`precious`, `ancient`, and `contest` do **not** count as dev hosts. `JOINUP_SEED_CONFIRM=dev` does not identify the database by itself. A live key, a prod-looking URL, or a host that matches `PROD_DATABASE_URL` cannot be overridden.

## One-time marker on the Neon dev branch

Run this in the dev database only, with the direct host (`-pooler` removed):

```sql
CREATE TABLE IF NOT EXISTS joinup_dev_seed_marker (
  id text PRIMARY KEY,
  host text NOT NULL
);
INSERT INTO joinup_dev_seed_marker (id, host)
VALUES ('dev', 'ep-your-endpoint.region.aws.neon.tech')
ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host;
```

The seed will not create this row. Local Postgres (`localhost`, `127.0.0.1`, `*.local`) skips the marker.

## Run

From `server/`, with the Neon **dev branch** URLs (pooled `DATABASE_URL`, direct `DIRECT_DATABASE_URL`) and the Clerk development secret:

```bash
cd server
export DATABASE_URL='postgresql://…-pooler…/neondb'
export DIRECT_DATABASE_URL='postgresql://…direct-host…/neondb'
export SEED_ALLOWED_DB_HOST='ep-your-endpoint.region.aws.neon.tech'
export CLERK_SECRET_KEY='sk_test_…'
export PUBLIC_SERVER_URL='https://joinup-dev-api.duckdns.org'
# Only when the host has no dev/preview/staging/test/branch/ci token:
export JOINUP_SEED_CONFIRM=dev
npm run seed:dev
```

The script checks the marker, applies migrations (`prisma migrate deploy`), and then writes `server/fixtures/devSeed.json` (gitignored). Playwright reads that file. `server/fixtures/devSeed.example.json` shows the shape with placeholder Clerk ids.

Sign-in for every seeded user is the email in the fixture plus code `424242` (Clerk test mode: `name+clerk_test@example.com`).

| Key | Email | Who |
|---|---|---|
| adultA | adult-a+clerk_test@example.com | נועה כהן, adult, friends with B, not with C |
| adultB | adult-b+clerk_test@example.com | יונתן לוי, adult, pending join on the approval game |
| minorC | minor-c+clerk_test@example.com | מאיה אביב, 14 years old on the seed date (Asia/Jerusalem), private chat with A |
| organizerO | organizer-o+clerk_test@example.com | עומר דהן, organizes the seeded games and groups |

Fixed rows include games in Tel Aviv, Haifa, Jerusalem, and Beer Sheva (soccer and basketball), a recurring **קבוצה** (`seed_series_weekly` — the copy never says סדרה), a friends-only game in each link mode, an approval game with B's request already pending, and the A–C private chat.

`minorC.birthDate` is computed at seed time so the account stays 14. It is not the fixed date `2012-06-01`.

The A–C private chat (`seed_chat_a_c`) is deliberate. A and C are **not** friends, and C's privacy columns stay null so the minor resolves to FRIENDS_ONLY. The chat exists so tests can exercise the adult→minor profanity filter. The fixture repeats that under `notes.adultMinorChat` and `chats.adultMinor.purpose`.

Re-running deletes previous seed rows, including games the weekly generator created with random ids on a seed field or seed group, and favorite-field rows for the seed fields. If Clerk recreates a `+clerk_test@example.com` user with a new id, the old row is re-pointed (or removed when that new id already exists) instead of failing the unique email.

`SEED_SKIP_MIGRATE=1` skips `prisma migrate deploy` when the schema is already current. The marker check still runs for remote databases.
