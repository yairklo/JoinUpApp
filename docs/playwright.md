# Playwright web regression

Hebrew RTL suite for the signed-in flows that matter: sign-in, logged-out redirects, search, create / join / leave, approval, friends-only games, friend-request notifications, chat safety, and minor privacy.

The suite reads `server/fixtures/devSeed.json`, which `server/scripts/seedDev.js` writes. Global setup runs that seed before the browsers start, unless `E2E_SKIP_SEED=1`.

## What the tests assert

- Logged-out `/games/:id`, `/series/:id`, and team management redirect to `/sign-in?redirect_url=...`.
- `POST /api/games/:id/join`, `GET /api/games/my`, `GET /api/messages`, and `POST /api/series/:id/subscribe` answer **401** without a token.
- Anonymous `GET /api/games/:id` and `GET /api/series/:id` for a **public** game or group stay **200**. A friends-only game with a blocked link stays **403**. Those reads are the shareable-link contract the server tests already lock. The web app still redirects guests.
- Search shows the seeded card (`data-testid=game-card-<id>`) and the map pane. Tile failures stay inside the map error boundary; the test checks the pane, not the tiles.
- Private adult→minor: the slur `זונה` is blocked for the sender and absent for the minor after reload. An ordinary sentence is delivered.
- A meeting request, a phone number, and a link are delivered only when the API has `OPENAI_API_KEY` or `GOOGLE_API_KEY` (`E2E_MODERATION_READY=1`). Adult A is not friends with minor C, so those gated messages fail closed without a model. There is no moderation bypass.
- Group chat does not lexicon-block ordinary speech (`חרא`). Report sends and the toast confirms it.
- Names rendered in profile headings, notification rows, chat bubbles, and the account avatar are never email-shaped. The footer support `mailto` is not part of that check.
- A stranger viewing the minor does not see friends, match history, or the minor's email. Age can still appear on the public profile; that is the current API.

## Run locally

Needs Node 20, a dev database, and Clerk **test** keys (`pk_test_` / `sk_test_`). The sign-in code for the seeded users is `424242` (`name+clerk_test@example.com`).

```bash
# server/.env — dev database only, never production
# DATABASE_URL=...          # Neon dev branch or local Postgres
# DIRECT_DATABASE_URL=...   # non-pooler
# CLERK_SECRET_KEY=sk_test_...
# JOINUP_SEED_CONFIRM=dev   # required when the host name has no dev/test/local marker

cd next_app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... NEXT_PUBLIC_API_URL=http://127.0.0.1:3005 npm run build

cd ../e2e
npm ci
npx playwright install chromium
CLERK_SECRET_KEY=sk_test_... CLERK_PUBLISHABLE_KEY=pk_test_... npm test
```

Against an already deployed dev API (no local web servers):

```bash
cd e2e
BASE_URL=https://<preview>.vercel.app \
API_URL=https://joinup-dev-api.duckdns.org \
E2E_SKIP_WEBSERVER=1 \
DATABASE_URL=... DIRECT_DATABASE_URL=... \
CLERK_SECRET_KEY=sk_test_... CLERK_PUBLISHABLE_KEY=pk_test_... \
JOINUP_SEED_CONFIRM=dev \
npm test
```

`DATABASE_URL` must be the Neon **dev** branch. The seed script exits if the URL or the Clerk key looks like production.

Useful knobs:

| Variable | Meaning |
| --- | --- |
| `BASE_URL` | Web app. Default `http://127.0.0.1:3000`. |
| `API_URL` | API. Default `http://127.0.0.1:3005`. |
| `E2E_SKIP_WEBSERVER=1` | Do not start the API or Next. Use with a deployed dev environment. |
| `E2E_SKIP_SEED=1` | Do not reset the database. The fixture file must already exist. |
| `SEED_FIXTURE` | Path to the JSON fixture. Default `server/fixtures/devSeed.json` (gitignored). |
| `E2E_MODERATION_READY=1` | Run the meeting / phone / link chat tests. |

Traces: `cd e2e && npx playwright show-report` after a failure. The runner records a trace, screenshot, and video only on failure. Tests wait on locators. They do not use fixed sleeps.

## Add a test for a new feature

1. Put a stable `data-testid` on the control the user actually uses. Prefer that over button text when the copy can change. Keep Hebrew assertions for the sentence the product promises.
2. If the flow needs data, extend `server/scripts/seedDev.js` with a fixed id (`seed_...`) and add the id to the fixture object. Re-run `npm run seed:dev` from `server/`.
3. Add `e2e/tests/<feature>.spec.ts`. Import `test`, `expect`, and `signIn` from `../support/auth`. Load ids with `loadFixture()` inside the test (the file is written by global setup, after collection).
4. Sign in with a seeded email. Switch users with `signOut` then `signIn`. Workers are 1 because the users and rows are shared.
5. Assert with `expect(...).toBeVisible()` / `toHaveURL()` so Playwright retries. Do not add `waitForTimeout`.
6. Push the branch. The workflow `.github/workflows/playwright.yml` runs on pull requests into `dev` or `Dev`.

## CI secrets and the required check

Repository secrets (test instance only — never `sk_live_` / `pk_live_`):

1. `CLERK_TEST_SECRET_KEY` = `sk_test_...`
2. `CLERK_TEST_PUBLISHABLE_KEY` = `pk_test_...`
3. Optional: `OPENAI_API_KEY` or `GOOGLE_API_KEY`, so the gated chat tests run instead of skipping.

The job name is **web regression**. To block merge:

1. GitHub → Settings → Branches → add a rule for `dev` (and `Dev` if that is still the integration branch).
2. Enable "Require status checks to pass before merging".
3. Select **web regression**.

The workflow does not run on pull requests into `main`. Open the regression PR against `dev` / `Dev` when that branch should be gated. This repository has no `dev` branch yet; use `Dev` until one is created.
