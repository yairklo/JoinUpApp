# Dev environment runbook (Coolify + Neon + Clerk + Vercel)

The VPS is managed by **Coolify**. Coolify terminates TLS, proxies to the container, and deploys on push. This repo does not add its own Caddy, docker-compose, or `deploy.sh`. Production stays on its current Coolify resource. Dev is a **second resource** with its own domain, database branch, and Clerk test keys.

Nothing in git contains a secret. If a value looks like a production password, Clerk live key (`pk_live_` / `sk_live_`), or the production Neon connection string, do not paste it into the dev resource.

There is no git branch named `dev` today. The integration branch that CI already watches is `Dev` (capital D). Coolify branch names are case-sensitive. Use `Dev` until you create a lowercase `dev` branch, or create `dev` from `Dev` and point the new resource at it. Do not point the dev resource at whatever commit production is running unless you intentionally want them in lockstep.

## What you click

### 1. Neon — a database that is not production

1. Open the Neon console and the JoinUp project.
2. **Branches → Create branch**. Name it `dev`. Parent: the current production branch (so the schema matches). This creates a new compute endpoint. It does not change production data.
3. Open the `dev` branch → **Connect**. Copy two strings:
   - **Pooled** connection string → this is `DATABASE_URL`.
   - **Direct** connection string → this is `DIRECT_DATABASE_URL`. The host must **not** contain `-pooler`. Prisma migrations use the direct string.
4. Keep both strings in a password manager. Do not commit them. Do not reuse the production branch's host.
5. **Reset** (when the dev data is a mess): Branches → `dev` → **Reset from parent**. That replaces the dev branch with a fresh copy of production's schema and data at the chosen point. Then run `server/scripts/seedDev.js` again (see the seed PR) if you want the fixed test users. Resetting does not touch the parent branch.

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
4. Source: GitHub `yairklo/JoinUpApp`, the same repo as production. Branch: `dev` if you created it, otherwise `Dev`.
5. **Build Pack: Dockerfile**. **Base Directory: `/server`**. Dockerfile location: `/server/Dockerfile` (the default once the base directory is `server`).
6. **Port**: `3005`. Leave **Start Command** empty. The image runs `npm start`, which applies `prisma migrate deploy` and then listens. A failed migration stops the boot, same as production. Do not set the command to `node index.js` — that skips migrations.
7. **Health check**: path `/api/health`, method GET, port `3005`, expected 200. Do **not** use `/api/health/deep` (it pings Postgres and keeps the Neon compute awake).
8. **Domains**: `https://joinup-dev-api.duckdns.org`. Let Coolify issue the certificate. Enable **Auto Deploy** on push to the selected branch.
9. **Environment variables** on this resource only (Coolify → the dev application → Environment Variables). Paste values, do not commit them:

   | Name | Dev value |
   |---|---|
   | `NODE_ENV` | `production` (so the process fails closed the same way prod does) |
   | `DATABASE_URL` | Neon **dev branch**, pooled |
   | `DIRECT_DATABASE_URL` | Neon **dev branch**, direct (no `-pooler`) |
   | `CLERK_SECRET_KEY` | `sk_test_...` |
   | `CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
   | `PUBLIC_SERVER_URL` | `https://joinup-dev-api.duckdns.org` |
   | `CORS_ORIGINS` | your production web origin only if a custom domain must call the dev API; Vercel preview hosts of this project are already allowed in code |
   | `CLOUDINARY_URL` | a Cloudinary URL. Required or the process will not boot. Prefer `CLOUDINARY_FOLDER=joinup-dev` so deletes cannot hit production images |
   | `CLOUDINARY_FOLDER` | `joinup-dev` |
   | `SENTRY_ENVIRONMENT` | `development` |
   | `RUN_BACKGROUND_JOBS` | `true` on this single API container. If you later add a second worker resource, set this to `false` on the API and `true` on the worker |

   Optional, same names as production if you want the feature on dev: `REDIS_URL`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `SENTRY_DSN`, `ADMIN_USER_IDS`, Firebase vars. Use dev credentials where the vendor gives you a separate project. `REDIS_URL` can be omitted: one API container runs without Redis (it logs a warning).

   If Coolify injects `PORT`, set it to `3005` or set the Coolify port to that same number. The process listens on `PORT` (default 3005) and the image health check follows `PORT`.

10. Deploy. When it is healthy: `curl -fsS https://joinup-dev-api.duckdns.org/api/health` returns JSON `"status":"OK"`. Migrations have already run (Coolify logs show `[BOOT] Prisma migrations OK`).

### 5. Vercel — Preview and Development only

1. Vercel → the JoinUp web project → **Settings → Environment Variables**.
2. For **Preview** and **Development** (not Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://joinup-dev-api.duckdns.org` |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
   | `CLERK_SECRET_KEY` | `sk_test_...` |

   If a variable is already set on Preview with a live key or the production API URL, change that Preview/Development row only.
3. Open **Production** and confirm it is unchanged: `NEXT_PUBLIC_API_URL=https://joinup-api.duckdns.org`, publishable key `pk_live_...`, secret `sk_live_...`.
4. `NEXT_PUBLIC_*` is baked in at build time. **Deployments → redeploy** the latest preview after saving. New previews pick the values up on their own.
5. Local web: copy `next_app/.env.example` to `next_app/.env.local` and fill the same three Preview values. Do not commit that file.

### 6. Mobile (only if you want a dev client)

`mobile_app/eas.json` production profiles point at `https://joinup-api.duckdns.org`. Leave them. For a local Expo session, set `EXPO_PUBLIC_API_URL` in `mobile_app/.env` to the dev API. Do not ship an EAS production update that points at the dev API.

## Check after the first deploy

- `curl -fsS https://joinup-dev-api.duckdns.org/api/health` → `status: OK`.
- `curl -fsS https://joinup-dev-api.duckdns.org/api/health/deep` once (not on a timer) → `db: up`.
- A Vercel preview loads and Clerk shows the development instance (the browser network panel calls a `pk_test_` frontend API, not `pk_live_`).
- Creating a game on the preview writes to the Neon dev branch, not production. Confirm in the Neon SQL editor on the `dev` branch.

## Pull request #366

[#366](https://github.com/yairklo/JoinUpApp/pull/366) adds `deploy/` with docker-compose, Caddy, `deploy.sh`, and a cutover runbook for a hand-built VPS. **Close it. Do not merge it.**

Coolify already owns TLS, the reverse proxy, health checks, auto-deploy, and env vars. Landing that compose stack on the same VPS would bind ports 80/443 a second time and fight Coolify's proxy. The script also checks out commits on the server, which is the opposite of how Coolify builds.

The useful facts from that PR are already how this repo works, and they are repeated above: port 3005, `GET /api/health` (not `/api/health/deep`), migrations before listen, `trust proxy` of one hop, Cloudinary required when `NODE_ENV=production`, Redis optional for a single API, `RUN_BACKGROUND_JOBS=false` on extra API instances. None of that needs a Caddyfile or `deploy.sh`.

## What not to do

- Do not paste production `DATABASE_URL`, `sk_live_`, or `pk_live_` into the dev resource.
- Do not point `DIRECT_DATABASE_URL` at a `-pooler` host.
- Do not health-check `/api/health/deep` on a short interval.
- Do not add a second Caddy or compose project on the VPS.
