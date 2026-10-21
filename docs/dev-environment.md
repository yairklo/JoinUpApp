# Dev environment runbook (Coolify + Neon + Clerk + Vercel)

The VPS is managed by **Coolify**. Coolify terminates TLS, proxies to the container, and deploys on push. This repo does not add its own Caddy, docker-compose, or `deploy.sh`. Production stays on its current Coolify resource. Dev is a **second resource** with its own domain, its own empty database, and Clerk test keys.

Nothing in git contains a secret. If a value looks like a production password, Clerk live key (`pk_live_` / `sk_live_`), the production Neon connection string, the production `REDIS_URL`, or a production Firebase private key, do not paste it into the dev resource.

## Do not copy production

A Neon branch whose parent is production is copy-on-write: it contains production rows. That includes real users (including minors), chats, and push tokens in `UserDevice` (`expoPushToken`, `fcmToken`).

Dev background jobs would then act on those rows. The game reminder worker sends push. The weekly «קבוצה» generator creates games from existing series, and those games are what the reminder and scheduler jobs pick up. With production tokens in `UserDevice`, a dev process can notify real phones.

- Start from an **empty** database. The schema is built by `prisma migrate deploy` on boot (`server/scripts/render-start.js`). Test data comes from `npm run seed:dev` ([#374](https://github.com/yairklo/JoinUpApp/pull/374)), not from production.
- Do **not** use **Branches → Create branch** with the production branch as parent.
- Do **not** use **Reset from parent**. That replaces dev with a fresh copy of production schema and data.
- **Never copy production data into dev without scrubbing.** If you ever import it anyway: truncate `UserDevice` and anonymize users before the API process runs jobs, and keep `RUN_BACKGROUND_JOBS=false` until that scrub is done and you have checked that no production push tokens remain.

`RUN_BACKGROUND_JOBS` defaults to **on** when the variable is unset (`server/index.js` only skips jobs for `false` or `0`). Set it to the string `false` until the database is the empty schema plus the dev seed.

## Git branch `Dev` (Yair moves it; this PR does not)

Coolify branch names are case-sensitive. CI already watches `Dev` (capital D). There is no lowercase `dev` branch. Do not create one for this resource.

`Dev` is behind `main`. At the time this was written, `origin/Dev` (`7990401`) was a direct ancestor of `origin/main` (`9d93f1c`): **173 commits behind, 0 commits of its own**. Check again before moving it:

```bash
git fetch origin Dev main
git rev-list --count origin/Dev..origin/main
git rev-list --count origin/main..origin/Dev
```

**Yair fast-forwards `Dev` from `main` by hand before the dev resource deploys it.** Do not point Coolify at the stale tip. When the second count is `0`, this is a fast-forward (run it on a checkout of `Dev`, not from this pull request):

```bash
git checkout Dev
git merge --ff-only origin/main
git push origin Dev
```

If `Dev` has commits that are not in `main`, stop and decide with Yair. Do not force-push `Dev` from this runbook. This pull request does not push to `Dev`, `main`, or any other branch except its own.

### Promotion

After that fast-forward, the dev Coolify resource tracks `Dev`. Production keeps tracking `main`. Do not point the dev resource at `main`.

1. Merge the change into `Dev`.
2. Coolify auto-deploys the dev environment. Test on `https://joinup-dev-api.duckdns.org` and a Vercel preview.
3. Promote by merging to `main`. Production Coolify deploys `main`.

Do not merge to `main` until the first dev deploy of this image is healthy. See [Before production deploys this image](#before-production-deploys-this-image).

## What you click

### 1. Neon — an empty database, not a copy of production

1. In the Neon console, **create a new project** named `joinup-dev`. A new project is an empty Postgres. It has no parent branch and no production rows.
2. Open that project → **Connect**. Copy two strings:
   - **Pooled** connection string → this is `DATABASE_URL`.
   - **Direct** connection string → this is `DIRECT_DATABASE_URL`. The host must **not** contain `-pooler`. Prisma migrations use the direct string.
3. Keep both strings in a password manager. Do not commit them. Do not reuse the production project's host.
4. The first successful dev boot runs `npx prisma migrate deploy` and creates the tables. Logs must show `[BOOT] Prisma migrations OK`. Until that line appears, the database has no schema.
5. Load test users only with the dev seed, from a checkout that contains `server/scripts/seedDev.js` ([#374](https://github.com/yairklo/JoinUpApp/pull/374)). The procedure, the refusal checks, and the marker SQL are in [`docs/dev-seed.md`](dev-seed.md). That file arrives with #374; it is not on this branch. The target is this **new empty Neon project**. It is not a branch of the production project.

   The seed does not read `server/.env`. From `server/`, export these in the shell (or pass `--env-file`) before `npm run seed:dev`:

   - `DATABASE_URL` — pooled connection string of this empty project.
   - `DIRECT_DATABASE_URL` — direct connection string of the same project. The host must not contain `-pooler`. After `-pooler` is removed, both URLs must be the same host and database.
   - `SEED_ALLOWED_DB_HOST` — that direct host (no `-pooler`). A remote database is refused when this is missing or does not match the host.
   - `CLERK_SECRET_KEY` — `sk_test_…`. A missing key, or any `pk_live_` / `sk_live_` key in the environment, makes the script exit before it writes.
   - `joinup_dev_seed_marker` — create this row **by hand** in that database (`id = 'dev'`, `host` = the same direct host). The seed does not insert it. Local Postgres skips the marker; this Neon host does not. The SQL is in `docs/dev-seed.md`.
   - `JOINUP_SEED_CONFIRM=dev` — required when the host has no whole-token `dev`, `preview`, `staging`, `test`, `branch`, or `ci` label. A fresh Neon endpoint usually has none of those, so set it. The flag does not bypass the allowlist, the marker, or a live Clerk key.

   ```bash
   cd server
   export DATABASE_URL='postgresql://…-pooler…/neondb'
   export DIRECT_DATABASE_URL='postgresql://…direct-host…/neondb'
   export SEED_ALLOWED_DB_HOST='ep-your-endpoint.region.aws.neon.tech'
   export CLERK_SECRET_KEY='sk_test_…'
   export JOINUP_SEED_CONFIRM=dev
   npm run seed:dev
   ```

   The script also refuses a production-looking host or database name and `PUBLIC_SERVER_URL=https://joinup-api.duckdns.org`. This pull request does not add the script.
6. To wipe a messy dev database: delete the Neon project and create another empty one (or drop the dev database inside that project), redeploy so `prisma migrate deploy` rebuilds the schema, create a new `joinup_dev_seed_marker` row for the new host, then run `npm run seed:dev` again with the exports above. Do not reset from production.

### 2. Clerk — test keys only

1. Open the Clerk dashboard. Use the **Development** instance (keys start with `pk_test_` and `sk_test_`). Do not open the Production instance for this.
2. Copy the publishable key and the secret key into the password manager.
3. **Configure → Domains** (or **API keys → Advanced**): add the dev web origins you will use (`http://localhost:3000` and the Vercel preview host if Clerk asks). Production domains stay on the Production instance.
4. Test-mode sign-in, used by the seed and Playwright: any address shaped `name+clerk_test@example.com` verifies with code `424242`. No email is sent.
5. Confirm the Production instance still shows `pk_live_` / `sk_live_` and that you did not paste those into the dev Coolify resource.

### 3. DuckDNS — the dev API hostname

1. In DuckDNS, add a record `joinup-dev-api` pointing at the same VPS IP as production (Coolify routes by hostname).
2. Leave `joinup-api` (production) alone.

### 4. Coolify — new "dev" resource (do not edit production)

1. Open Coolify → the JoinUp project.
2. Add an environment named `dev` (project → environment switcher → **Add Environment**). Switch into `dev` before creating anything. If your Coolify version has no environments, create a second application in the same project and name it `joinup-api-dev`. Do not change the existing production application's settings.
3. **+ New → Application**.
4. Source: GitHub `yairklo/JoinUpApp`, the same repo as production. Branch: `Dev`, and only after the fast-forward in [Git branch `Dev`](#git-branch-dev-yair-moves-it-this-pr-does-not). Do not select the stale `Dev` tip, and do not select `main`.
5. **Build Pack: Dockerfile**. Open the **production** application and copy the Base Directory and Dockerfile location it already builds with. Coolify resolves the Dockerfile location **relative to the base directory**.
   - If production uses base directory `/server`, the Dockerfile location is `/Dockerfile` (the file `server/Dockerfile`).
   - Do **not** set base directory `/server` and Dockerfile location `/server/Dockerfile`. That looks for `server/server/Dockerfile` and the build fails.
   - If production uses a different working pair (for example base `/` and Dockerfile `/server/Dockerfile`), use that same pair. Do not invent a second combination.
6. **Port**: `3005`. Leave **Start Command** empty. The image runs `npm start` (`server/scripts/render-start.js`), which applies `prisma migrate deploy` and then listens. A failed migration stops the boot, same as production. Do not set the command to `node index.js` — that skips migrations. The image `CMD` does not run `prisma migrate deploy` a second time; `render-start.js` is the one apply.
7. **Health check**: path `/api/health`, method GET, port `3005`, expected 200. Do **not** use `/api/health/deep` (it pings Postgres and keeps the Neon compute awake). The image also has a Docker `HEALTHCHECK` on the same path. That check ships to production when this merges to `main` — see below.
8. **Domains**: `https://joinup-dev-api.duckdns.org`. Let Coolify issue the certificate. Enable **Auto Deploy** on push to `Dev`.
9. **Environment variables** on this resource only (Coolify → the dev application → Environment Variables). Paste values, do not commit them:

   | Name | Dev value |
   |---|---|
   | `NODE_ENV` | `production` (so the process fails closed the same way prod does) |
   | `DATABASE_URL` | Neon **empty dev project**, pooled. Not the production host |
   | `DIRECT_DATABASE_URL` | Neon **empty dev project**, direct (no `-pooler`) |
   | `CLERK_SECRET_KEY` | `sk_test_...` |
   | `CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
   | `PUBLIC_SERVER_URL` | `https://joinup-dev-api.duckdns.org` |
   | `CORS_ORIGINS` | your production web origin only if a custom domain must call the dev API; Vercel preview hosts of this project are already allowed in code |
   | `CLOUDINARY_URL` | a Cloudinary URL. Required or the process will not boot. Prefer `CLOUDINARY_FOLDER=joinup-dev` so deletes cannot hit production images |
   | `CLOUDINARY_FOLDER` | `joinup-dev` |
   | `SENTRY_ENVIRONMENT` | `development` |
   | `RUN_BACKGROUND_JOBS` | `false` until this database is only the empty schema plus `seed:dev` and contains no production `UserDevice` rows. Unset means jobs **on**. After that check, you may set `true` on this single API container. A later worker resource: `false` on the API, `true` on the worker |

   Do **not** reuse production Redis or production push credentials. Same variable *names* are not the same as the same *values*.

   - **`REDIS_URL`:** never paste the production URL. The API publishes and subscribes on `joinup:socket_events` and `joinup:scheduler_events` (`server/utils/socketBridge.js`). A shared Redis crosses sockets and scheduler events between dev and production. Leave `REDIS_URL` unset (one API container runs without Redis and logs a warning) or point it at a **separate** Redis that production does not use.
   - **Firebase:** never paste production `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, or `FIREBASE_SERVICE_ACCOUNT_PATH`. Leave them unset on dev unless they belong to a different Firebase project that has no production tokens.
   - **Expo:** this API constructs `new Expo()` with no access token (`server/services/notificationService.js`). Delivery follows `UserDevice.expoPushToken`. There is no production Expo secret to copy, and you must not copy those tokens. Do not add a production Expo access token to this resource.

   Other optional names (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `SENTRY_DSN`, `ADMIN_USER_IDS`) may be set when you want the feature on dev. Use a dev credential where the vendor has a separate project.

   If Coolify injects `PORT`, set it to `3005` or set the Coolify port to that same number. The process listens on `PORT` (default 3005) and the image health check follows `PORT`.

10. Deploy. When it is healthy: `curl -fsS https://joinup-dev-api.duckdns.org/api/health` returns JSON `"status":"OK"`. Migrations have already run (Coolify logs show `[BOOT] Prisma migrations OK`). Then run the seed from step 1.

### 5. Vercel — Preview and Development only

1. Vercel → the JoinUp web project → **Settings → Environment Variables**.
2. For **Preview** and **Development** (not Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://joinup-dev-api.duckdns.org` |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
   | `CLERK_SECRET_KEY` | `sk_test_...` |

   If a variable is already set on Preview with a live key or the production API URL, change that Preview/Development row only.
3. **`NEXT_PUBLIC_CLERK_PROXY_URL` must not be set on Preview or Development.** Delete it on those environments if it is set, including a project-wide value that Preview inherits. Do not set it in `next_app/.env.local` when the publishable key is `pk_test_`.

   `resolveClerkProxyUrl()` returns nothing for `pk_test_`, and this app's middleware then does not forward `/__clerk`. That does not stop Clerk. `@clerk/nextjs@6.39.6` reads `NEXT_PUBLIC_CLERK_PROXY_URL` directly in `ClerkProvider` and `clerkMiddleware`. `ClerkProvider` merges with `props.proxyUrl || process.env.NEXT_PUBLIC_CLERK_PROXY_URL`, so omitting the prop, or passing `undefined` or `""`, still keeps a set variable. `clerkMiddleware` uses the env value when `proxyUrl` is omitted. Next inlines `NEXT_PUBLIC_*` at build time, so a preview built with the variable set sends `pk_test_` traffic through the production `/__clerk` proxy (`frontend-api.clerk.dev`). There is no app-side override that clears it for the provider without changing `pk_live_` behaviour.

   Production may keep the variable. `pk_live_` still defaults to `/__clerk` when it is unset, and an explicit value still overrides that default for live keys only.
4. Open **Production** and confirm it is unchanged: `NEXT_PUBLIC_API_URL=https://joinup-api.duckdns.org`, publishable key `pk_live_...`, secret `sk_live_...`.
5. `NEXT_PUBLIC_*` is baked in at build time. **Deployments → redeploy** the latest preview after saving. New previews pick the values up on their own.
6. Local web: copy `next_app/.env.example` to `next_app/.env.local` and fill the same three Preview values. `NEXT_PUBLIC_CLERK_PROXY_URL` must not be set there when the key is `pk_test_` — the Clerk SDK reads it even though `resolveClerkProxyUrl()` returns undefined. Do not commit that file.

### 6. Mobile (only if you want a dev client)

`mobile_app/eas.json` production profiles point at `https://joinup-api.duckdns.org`. Leave them. For a local Expo session, set `EXPO_PUBLIC_API_URL` in `mobile_app/.env` to the dev API. Do not ship an EAS production update that points at the dev API.

## Check after the first deploy

- `curl -fsS https://joinup-dev-api.duckdns.org/api/health` → `status: OK`.
- Coolify logs contain `[BOOT] Prisma migrations OK` (schema was applied to the empty project).
- `curl -fsS https://joinup-dev-api.duckdns.org/api/health/deep` once (not on a timer) → `db: up`.
- A Vercel preview loads and Clerk shows the development instance (the browser network panel calls a `pk_test_` frontend API, not `pk_live_`, and not `/__clerk` on the preview host).
- Creating a game on the preview writes to the empty Neon dev project, not production. Confirm in the Neon SQL editor on that project.
- `RUN_BACKGROUND_JOBS` is `false` until `seed:dev` is the only data and `UserDevice` has no production tokens.

## Before production deploys this image

`server/Dockerfile` `HEALTHCHECK` and `CMD ["npm", "start"]` apply to every Coolify build of this image, including production, once this merges to `main`.

`npm start` is `node scripts/render-start.js`. That script still runs `npx prisma migrate deploy` and then loads `index.js`. A failed migration still refuses to boot (`ALLOW_START_ON_MIGRATION_FAILURE=true` is the only override). Migrations keep applying automatically on boot. The Dockerfile used to run `prisma migrate deploy && npm start`, which applied migrations twice; it now applies them once, inside `render-start.js`.

Confirm the **first dev deploy** is healthy before merging to `main` (production auto-deploys from `main`):

- Coolify marks the dev application healthy.
- Logs include `[BOOT] Prisma migrations OK`.
- `curl -fsS https://joinup-dev-api.duckdns.org/api/health` returns `"status":"OK"`.

## Pull request #366

[#366](https://github.com/yairklo/JoinUpApp/pull/366) adds `deploy/` with docker-compose, Caddy, `deploy.sh`, and a cutover runbook for a hand-built VPS. **Close it. Do not merge it.**

Coolify already owns TLS, the reverse proxy, health checks, auto-deploy, and env vars. Landing that compose stack on the same VPS would bind ports 80/443 a second time and fight Coolify's proxy. The script also checks out commits on the server, which is the opposite of how Coolify builds.

The useful facts from that PR are already how this repo works, and they are repeated above: port 3005, `GET /api/health` (not `/api/health/deep`), migrations before listen, `trust proxy` of one hop, Cloudinary required when `NODE_ENV=production`, Redis optional for a single API, `RUN_BACKGROUND_JOBS=false` on extra API instances. None of that needs a Caddyfile or `deploy.sh`.

## What not to do

- Do not branch the dev database from production, and do not **Reset from parent**.
- Do not paste production `DATABASE_URL`, `sk_live_`, `pk_live_`, `REDIS_URL`, or Firebase credentials into the dev resource.
- Do not leave `RUN_BACKGROUND_JOBS` unset or `true` on a database that still has production `UserDevice` rows.
- Do not point `DIRECT_DATABASE_URL` at a `-pooler` host.
- Do not point the dev Coolify resource at `Dev` until Yair has fast-forwarded it from `main`, and do not push to `Dev` as part of this pull request.
- Do not set `NEXT_PUBLIC_CLERK_PROXY_URL` on Vercel Preview or Development, or in a local `pk_test_` env. `@clerk/nextjs` reads it even when `resolveClerkProxyUrl()` returns undefined.
- Do not health-check `/api/health/deep` on a short interval.
- Do not merge this to `main` until the first dev deploy is healthy.
- Do not add a second Caddy or compose project on the VPS.
