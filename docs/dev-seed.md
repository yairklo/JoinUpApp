# Dev seed

`server/scripts/seedDev.js` resets and rewrites a fixed dataset on the **dev** database. It is idempotent: run it again and the same rows are replaced. It does not drop unrelated data.

It refuses to start when any of these are true:

- `CLERK_SECRET_KEY` is missing or is not `sk_test_…`
- any Clerk key in the environment is `pk_live_` / `sk_live_`
- `DATABASE_URL` equals `PROD_DATABASE_URL`
- the database host or name looks like production (`prod` / `production`)
- `PUBLIC_SERVER_URL` is `https://joinup-api.duckdns.org`
- the host is not localhost / a name containing `dev`, `test`, `staging`, `preview`, `branch`, or `ci`, and `JOINUP_SEED_CONFIRM=dev` is not set

A Neon dev-branch host often does not contain the word `dev`. That case needs the confirm flag **and** a test Clerk key. The confirm flag does not override a live key or a prod-looking URL.

## Run

From `server/`, with the Neon **dev branch** URLs (pooled `DATABASE_URL`, direct `DIRECT_DATABASE_URL`) and the Clerk development secret:

```bash
cd server
export DATABASE_URL='postgresql://…dev-branch…-pooler…/neondb'
export DIRECT_DATABASE_URL='postgresql://…dev-branch…/neondb'
export CLERK_SECRET_KEY='sk_test_…'
export PUBLIC_SERVER_URL='https://joinup-dev-api.duckdns.org'
export JOINUP_SEED_CONFIRM=dev
npm run seed:dev
```

The script applies migrations (`prisma migrate deploy`) and then writes `server/fixtures/devSeed.json` (gitignored). Playwright reads that file. `server/fixtures/devSeed.example.json` shows the shape with placeholder Clerk ids.

Sign-in for every seeded user is the email in the fixture plus code `424242` (Clerk test mode: `name+clerk_test@example.com`).

| Key | Email | Who |
|---|---|---|
| adultA | adult-a+clerk_test@example.com | נועה כהן, adult, friends with B |
| adultB | adult-b+clerk_test@example.com | יונתן לוי, adult, pending join on the approval game |
| minorC | minor-c+clerk_test@example.com | מאיה אביב, born 2012, private chat with A |
| organizerO | organizer-o+clerk_test@example.com | עומר דהן, organizes the seeded games and groups |

Fixed rows include games in Tel Aviv, Haifa, Jerusalem, and Beer Sheva (soccer and basketball), a recurring **קבוצה** (`seed_series_weekly` — the copy never says סדרה), a friends-only game in each link mode, an approval game with B's request already pending, and the A–C private chat.

`SEED_SKIP_MIGRATE=1` skips `prisma migrate deploy` when the schema is already current.
