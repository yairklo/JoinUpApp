# Playwright web regression

Hebrew RTL suite for the signed-in flows that matter: sign-in, logged-out redirects, search, create / join / leave, approval, friends-only games, friend-request notifications, chat safety, and minor privacy.

The suite reads `server/fixtures/devSeed.json`, which `server/scripts/seedDev.js` writes. Global setup runs that seed before the browsers start, unless `E2E_SKIP_SEED=1`.

## What the tests assert

- Logged-out `/games/:id`, `/series/:id`, and team management redirect to `/sign-in?redirect_url=...`.
- `POST /api/games/:id/join`, `GET /api/games/my`, `GET /api/messages`, and `POST /api/series/:id/subscribe` answer **401** without a token.
- Anonymous `GET /api/games/:id` and `GET /api/series/:id` for a **public** game or group stay **200**. A friends-only game with a blocked link stays **403**. Those reads are the shareable-link contract the server tests already lock. The web app still redirects guests.
- Search shows the seeded card (`data-testid=game-card-<id>`) and the map pane. Tile failures stay inside the map error boundary; the test checks the pane, not the tiles.
- Private adult→minor: the slur `זונה` is blocked for the sender and absent for the minor after reload. An ordinary sentence is delivered. Extreme profanity is blocked only in that private adult↔minor chat. Group chat does not lexicon-block ordinary speech (`חרא`).
- A meeting proposal (`ניפגש …`), a phone number, and a link are delivered. CI runs these against `MODERATION_PROVIDER=stub` (dev/CI only; the API refuses the stub when `NODE_ENV=production`). A real `OPENAI_API_KEY` or `GOOGLE_API_KEY` is optional and is not used when the stub is on. Without either provider, adult A is not friends with minor C, so those gated messages fail closed.
- Group chat report sends and the toast confirms it.
- Names rendered in profile headings, notification rows, chat bubbles, and the account avatar are never email-shaped. The footer support `mailto` is not part of that check.
- A stranger viewing the minor does not see friends, match history, or the minor's email. `profile-email` is either absent or its text contains no `@` (older builds show «אימייל לא זמין»; the privacy change removes the row for non-owners). Age is hidden from strangers on a minor's profile: `profile-age` is absent, and `main` has no exact «גיל» label.

## Run locally

Needs Node 24, a dev database, and Clerk **test** keys (`pk_test_` / `sk_test_`). The sign-in code for the seeded users is `424242` (`name+clerk_test@example.com`).

`DATABASE_URL` and `DIRECT_DATABASE_URL` must be exported in the shell that starts Playwright. Putting them only in `server/.env` is refused: global setup will not run, and the API process Playwright starts does not load that file (`JOINUP_SKIP_DOTENV=1` plus an explicit environment). Localhost, `127.0.0.1`, and `*.local` need no allowlist. Every remote host needs `SEED_ALLOWED_DB_HOST` set to the canonical host (`-pooler` removed). Both URLs must be that same database, and `DIRECT_DATABASE_URL` must not use a pooler host. `JOINUP_SEED_CONFIRM=dev` does not choose the database. Remote seeds also follow `docs/dev-seed.md` (a marker row, and the confirm flag only when the hostname has no `dev` / `preview` / `staging` / `test` / `branch` / `ci` token). If `PROD_DATABASE_URL` is set and either URL uses that host, the run refuses.

```bash
# Export these in the shell. Do not rely on server/.env.
export DATABASE_URL='postgresql://joinup:joinup@localhost:5432/joinup_e2e'
export DIRECT_DATABASE_URL='postgresql://joinup:joinup@localhost:5432/joinup_e2e'
# Neon dev branch whose hostname does not already say dev/test/local:
# export SEED_ALLOWED_DB_HOST='ep-name.eu-central-1.aws.neon.tech'
export CLERK_SECRET_KEY='sk_test_...'
export CLERK_PUBLISHABLE_KEY='pk_test_...'
export MODERATION_PROVIDER=stub   # dev/CI only; refused when NODE_ENV=production
export E2E_SERVER_NODE_ENV=test        # disables the per-IP rate limiter (a whole suite from one IP hits 429)

cd next_app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... NEXT_PUBLIC_API_URL=http://127.0.0.1:3005 npm run build

cd ../e2e
npm ci
npx playwright install chromium
npm test
```

Against an already deployed dev API (no local web servers):

```bash
cd e2e
export DATABASE_URL='...'          # Neon dev branch, in the shell
export DIRECT_DATABASE_URL='...'
export SEED_ALLOWED_DB_HOST='ep-name.eu-central-1.aws.neon.tech'
export CLERK_SECRET_KEY='sk_test_...'
export CLERK_PUBLISHABLE_KEY='pk_test_...'
BASE_URL=https://<preview>.vercel.app \
API_URL=https://joinup-dev-api.duckdns.org \
E2E_SKIP_WEBSERVER=1 \
npm test
```

`DATABASE_URL` must be the Neon **dev** branch (or local Postgres), never production.

Useful knobs:

| Variable | Meaning |
| --- | --- |
| `BASE_URL` | Web app. Default `http://127.0.0.1:3000`. |
| `API_URL` | API. Default `http://127.0.0.1:3005`. |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Required in the shell. Not read from `server/.env`. |
| `SEED_ALLOWED_DB_HOST` | Required for any remote host. The canonical host with `-pooler` removed. Both URLs must match it. |
| `PROD_DATABASE_URL` | Optional. When set, a URL that points at that database is refused. |
| `E2E_SKIP_WEBSERVER=1` | Do not start the API or Next. Use with a deployed dev environment. |
| `E2E_SKIP_SEED=1` | Do not reset the database. The fixture file must already exist. The shell URLs are still required. |
| `SEED_FIXTURE` | Path to the JSON fixture. Default `server/fixtures/devSeed.json` (gitignored). |
| `MODERATION_PROVIDER=stub` | Deterministic moderation for dev/CI. The API throws if this is set with `NODE_ENV=production`. |
| `E2E_MODERATION_READY=1` | Also runs the meeting / phone / link tests when a real model key is configured instead of the stub. |
| `E2E_SERVER_NODE_ENV` | `NODE_ENV` for the API Playwright starts. Use `test` (CI): it disables the per-IP rate limiter and background jobs, which a single-IP suite would otherwise trip (429). |

Traces: `cd e2e && npx playwright show-report` after a failure. The runner records a trace, screenshot, and video only on failure. Tests wait on locators. They do not use fixed sleeps. Retries are 0: the seed is stateful, and a retry would fail because the first attempt already changed those rows.

## Add a test for a new feature

1. Put a stable `data-testid` on the control the user actually uses. Prefer that over button text when the copy can change. Keep Hebrew assertions for the sentence the product promises.
2. If the flow needs data, extend `server/scripts/seedDev.js` with a fixed id (`seed_...`) and add the id to the fixture object. Re-run `npm run seed:dev` from `server/`.
3. Add `e2e/tests/<feature>.spec.ts`. Import `test`, `expect`, and `signIn` from `../support/auth`. Load ids with `loadFixture()` inside the test (the file is written by global setup, after collection).
4. Sign in with a seeded email. Switch users with `signOut` then `signIn`. Workers are 1 because the users and rows are shared.
5. Assert with `expect(...).toBeVisible()` / `toHaveURL()` so Playwright retries the locator. Do not add `waitForTimeout`. The project retry count stays 0.
6. Push the branch. The workflow `.github/workflows/playwright.yml` runs on pull requests into `dev`, `Dev`, `main`, or `cursor/dev-seed-2100`, and on `workflow_dispatch`.

## CI secrets and the required check

Repository secrets (test instance only — never `sk_live_` / `pk_live_`):

1. `CLERK_TEST_SECRET_KEY` = `sk_test_...`
2. `CLERK_TEST_PUBLISHABLE_KEY` = `pk_test_...`

No model key is required. CI sets `MODERATION_PROVIDER=stub` and throws away the Postgres service on localhost. Do not add `OPENAI_API_KEY` or `GOOGLE_API_KEY` for this job.

The job runs `node --test e2e/support/dbEnv.test.js` before the Clerk secret check, so the database guard is covered even when those secrets are missing.

The job name is **web regression**. To block merge:

1. GitHub → Settings → Branches → add a rule for `main` (and for `dev` / `Dev` if that is still an integration branch).
2. Enable "Require status checks to pass before merging".
3. Select **web regression**.

The workflow runs on pull requests into `main`, so a release PR is gated by the same suite. It also runs on pull requests into `cursor/dev-seed-2100` while this stack is open, and can be started by hand (`workflow_dispatch`).
