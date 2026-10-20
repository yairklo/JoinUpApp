# JoinUp deployment runbook

Deployment as code for the Docker + Caddy VPS setup of the **API**. The **web app is hosted on Vercel** (the repo only
references `VERCEL_URL`; confirm) and is not part of this stack. Nothing here contains secrets; real values live only in
`deploy/.env` and `deploy/api.env` on the server (git-ignored).

```
Vercel (web) --> https://API_DOMAIN --> Caddy (:80/:443, TLS) --> api:3005 (Express + Socket.IO at /api/socket)
                                        worker (optional)  --\
                                        api / worker --> redis:6379 (internal)    api / worker --> Postgres (EXTERNAL)
```

| File | Purpose |
|---|---|
| `docker-compose.yml` | api, worker (profile), redis, caddy; healthchecks, restart policy, log rotation |
| `docker-compose.prod.yml` | memory/CPU limits, configurable from `.env` |
| `caddy/Caddyfile` | TLS, reverse proxy, WebSocket, compression, headers, timeouts |
| `deploy.sh` | deploy / rollback / status / logs / migrate (lock, auto-rollback, image pruning) |
| `.env.example`, `api.env.example` | every variable name the code reads |

**Always run compose from `deploy/`.** `.env` sets `COMPOSE_FILE` so plain `docker compose ...` uses the same files (incl. resource limits) as `deploy.sh`; without it containers get recreated without limits.

## Facts taken from the repo
- API: `server/Dockerfile` (node:20-alpine, port **3005**, has curl); liveness `GET /api/health` (no DB), readiness `GET /api/health/deep` (DB + Redis; do not poll tightly, it keeps Neon awake).
- Socket.IO path `/api/socket`; Express `trust proxy = 1` (one proxy hop = Caddy).
- Uploads: images only, 5 MB (`shared/upload.js`), stored in Cloudinary; server refuses to boot in production without `CLOUDINARY_URL`.
- Prisma needs `DATABASE_URL` and `DIRECT_DATABASE_URL`. The image CMD migrates on boot; compose runs `node index.js` instead so migrations are the explicit step in `deploy.sh` (a rollback never re-migrates).
- `worker.js` runs jobs without HTTP; `RUN_BACKGROUND_JOBS=false` disables jobs in the API process.
- CI (`.github/workflows/ci.yml`) only builds/tests; no image build, registry or deploy workflow exists.

### What Redis does in `main` today
Used for moderation/revocation fan-out, the worker -> API socket bridge and scheduler resync (`server/utils/socketBridge.js`, `index.js`). **Rate limits are in-memory per process and there is no Socket.IO Redis adapter yet.** A single API instance works without Redis (it logs warnings); the stack still includes it so a `worker` can reach the API. Data is ephemeral: no persistence, `volatile-lru`, password required.

## Assumptions / TODOs - please confirm
1. Web is on Vercel; set `NEXT_PUBLIC_API_URL=https://<API_DOMAIN>` (and `NEXT_PUBLIC_SOCKET_URL` if used) in the Vercel project env and redeploy it; add the Vercel domain(s) to `CORS_ORIGINS` in `api.env`. Clerk and Cloudinary dashboards may also hold the domain.
2. `joinup-api.duckdns.org` is inferred from a test file; set the real `API_DOMAIN`.
3. Postgres is external (Neon per repo docs). TODO: record provider, plan, region and who holds access.
4. Cloudflare in front of the API? Unknown. If yes set `TRUST_CF_CONNECTING_IP=true`; `trust proxy = 1` would then see Cloudflare as the hop - verify client IPs in logs.
5. Existing VPS details (firewall, volumes, current compose/Caddyfile) were not visible: reconcile them during the cutover.
6. Images are built on the server (no registry). TODO: CI build+push to GHCR.
7. Default limits assume a 1 vCPU / ~2 GB VPS (`API_CPUS`, `API_MEM_LIMIT`).

## Cutover from the existing hand-built VPS
Ports 80/443 and container names clash with the running stack: do this in a short maintenance window.
1. **Inspect the live setup first**: `docker ps -a`, `docker volume ls`, `docker inspect <caddy>`, the live Caddyfile and any compose file / run flags, and the env of the API container. Write down the old container names. Reconcile differences into `deploy/`.
2. Clone the repo, create `deploy/.env` and `deploy/api.env` (copy values across on the server: `docker inspect <api> --format '{{range .Config.Env}}{{println .}}{{end}}' > deploy/api.env`, then delete the entries that compose sets: NODE_ENV, PORT, REDIS_URL, RUN_BACKGROUND_JOBS. This prints secrets to the file only; never paste them anywhere). Add a new `REDIS_PASSWORD`. `chmod 600 .env api.env`.
3. **Keep TLS certificates** so Let's Encrypt is not hit again. Detect where the old Caddy keeps its data: `docker inspect <caddy> --format '{{json .Mounts}}'` and look for the `/data` mount.
   - Named volume (`"Type":"volume"`): `docker volume create joinup_caddy-data && docker run --rm -v <old_volume>:/from:ro -v joinup_caddy-data:/to alpine cp -a /from/. /to/`
   - Bind mount (`"Type":"bind"`, a host path): same command with `-v /host/path:/from:ro`.
   - Caddy installed on the host (systemd): data is in `/var/lib/caddy/.local/share/caddy`; copy it the same way, then `systemctl disable --now caddy`.
   - No mount at all: certs live inside the old container; copy out with `docker cp <caddy>:/data ./caddy-data-old` and in with the bind-mount command. If unsure, accept a reissue (Let's Encrypt allows ~5 duplicate certs/week).
   The volume must contain `caddy/certificates/` and `caddy/acme/` at its root.
4. Validate: `cd deploy && docker compose config -q` (never print `docker compose config` into logs or chats: it expands every secret).
5. Deploy with takeover: `TAKEOVER=1 ./deploy.sh deploy`. The script builds and migrates first, then stops (not removes) whatever container publishes 80/443, then starts the new stack. The stopped names are saved in `.state/old_containers`.
6. Verify: `curl -fsS https://$API_DOMAIN/api/health`, `/api/health/deep`, log in from the Vercel app, open a game chat (WebSocket).
7. **If the first deploy fails** the script runs `docker compose down` and `docker start`s the old containers automatically. If it could not, do it by hand: `docker compose down; docker start $(cat .state/old_containers)`.
8. After days of stable operation remove the old containers/volumes.

## First-time provisioning (new empty server)
1. Ubuntu LTS VPS; non-root sudo user; SSH keys only; `ufw allow 22,80,443/tcp` + `443/udp`, enable.
2. Install Docker Engine + Compose plugin and git; add the user to the `docker` group (that group can read all container env, i.e. every secret: keep it small).
3. DNS: point `API_DOMAIN` at the server **before** starting (ACME HTTP challenge needs port 80). DuckDNS: the record only has your IP; keep the DuckDNS updater (token + cron/`curl` on the new IP) in place, update it when the IP changes, and note wildcard certs are not possible with the HTTP challenge (not needed here).
4. `git clone https://github.com/yairklo/JoinUpApp.git /opt/joinup && cd /opt/joinup/deploy`
5. `cp .env.example .env; cp api.env.example api.env`; fill from the password manager; `chmod 600 .env api.env`. Allow the server IP in the DB provider if it filters IPs.
6. `./deploy.sh deploy`; verify as in cutover step 6.

## Deploy
```bash
cd /opt/joinup/deploy
./deploy.sh deploy            # origin/main
./deploy.sh deploy <sha>      # a specific commit
```
Takes a lock (two deploys cannot race), requires a clean checkout, checks out the commit (detached), builds `joinup-api:<sha12>`, runs `prisma migrate deploy`, then `docker compose up -d --wait`. State goes to `.state/{current,previous,failed}`. If the new containers are unhealthy it checks out the previous commit and restarts that image (compose files and Caddyfile of the previous version, not the failed one) and records the failed sha. Old images are pruned keeping current, previous and the last `KEEP_TAGS` (5) tags; **never** use `docker image prune -a` or `docker system prune -a` here, they delete rollback tags. `deploy.sh` re-executes from a temp copy because `git checkout` rewrites it mid-run.

Pre-deploy checklist: CI green; new migrations reviewed (below); restore point taken if a migration is destructive.

## Rollback
```bash
./deploy.sh status
./deploy.sh rollback          # previous deploy
./deploy.sh rollback <sha>    # any tag (docker image ls joinup-api); rebuilt from git if the image was pruned
```
Checks out the target commit (so its compose/Caddy files apply), starts its image, waits for health. Takes seconds. **It does not undo migrations.**

### Database migrations and rollback (Prisma)
Prisma has no down migrations, and `deploy.sh` migrates **before** swapping containers:
- while the swap happens, and after any rollback, the *old* code runs against the *new* schema. Additive migrations (nullable column, new table/index) are fine. Drops, renames, new NOT NULL without default and type changes can break the running version. Use expand/contract: ship the additive step first, remove the old column in a later release.
- Before a destructive migration take a restore point (below).
- A failed migration stops the deploy before containers change (old version keeps serving). Fix forward with a new migration, or repair by hand and mark it: `docker compose run --rm --no-deps api npx prisma migrate resolve --applied|--rolled-back <name>`. Never edit an applied migration.
- True revert = a new corrective migration, or restore the backup (loses data written since).

### Backups
- **Database**: Neon branches/point-in-time restore (check retention on your plan) or a dump that keeps the URL out of the command line:
  `docker run --rm --env-file api.env postgres:16-alpine sh -c 'pg_dump "$DIRECT_DATABASE_URL" -Fc' > backup-$(date +%F).dump` (note: `docker run --env-file` does not interpolate `$$`; if the password contains `$`, write it once in a private file instead). Restore: `pg_restore --clean --if-exists -d <target-url> backup.dump` into a scratch DB first.
- **Caddy data** (certs, ACME account): `docker run --rm -v joinup_caddy-data:/d:ro -v "$PWD":/b alpine tar czf /b/caddy-data-$(date +%F).tgz -C /d .` weekly, stored off-server. Redis needs no backup.
- `.env`, `api.env`: keep a copy in the password manager.

### Monitoring (minimum)
External uptime check (UptimeRobot, healthchecks.io, ...) on `https://API_DOMAIN/api/health` every minute with an alert to you; not on `/api/health/deep`. Sentry is already wired through `SENTRY_DSN`.

## Second server
**State of `main` today:** each API process keeps its own Socket.IO rooms and rate-limit counters (no adapter, in-memory limits). Two *active* API servers behind one name would split realtime events and rate limits, so today a second server is a **warm standby**, not a scale-out:
1. Provision as above with the same `api.env`; deploy the same sha; do not run background jobs there (`API_RUN_BACKGROUND_JOBS=false`) until it takes over.
2. To fail over: stop the stack on A (or let it be dead), set `API_RUN_BACKGROUND_JOBS=true` on B, repoint DNS (low TTL, DuckDNS update) to B. Caddy gets a cert on first request (HTTP challenge), or copy `caddy-data` beforehand.
3. Redis is local to each server and holds only ephemeral data.

**Worker profile (works today):** `COMPOSE_PROFILES=worker` and `API_RUN_BACKGROUND_JOBS=false` in `.env` (`deploy.sh` refuses to run otherwise). The worker gets `REDIS_URL` from compose so its socket events reach the API.

### Future, requires PR #370 (not configured yet)
#370 adds flags `SOCKET_ADAPTER`, `RATE_LIMIT_STORE`, `CHAT_RATE_STORE`, `JOBS_LEADER_LOCK` (all on `REDIS_URL`). Once merged, a real scale-out needs: a Redis shared by all servers (private network, password, not the per-server containers), those flags enabled in `api.env`, sticky sessions in Caddy (`lb_policy cookie`, commented example in `caddy/Caddyfile`), and `JOBS_LEADER_LOCK` instead of hand-managing which node runs jobs. Align this section and the compose file after #370 lands.

## Secrets handling
- `docker compose config` and `docker inspect <container>` print every secret, including the Redis password. Use `docker compose config -q` for validation; never paste their output into tickets, chats or CI logs.
- Keep real values out of shell history: edit the env files with an editor, not `echo SECRET=... >>`; don't put secrets on command lines (`pg_dump` example above uses `--env-file`).
- Compose interpolates `$` in `.env` and in `env_file` files: write a literal `$` as `$$` (e.g. a password inside `DATABASE_URL`), or use URL-safe passwords. Percent-encode special characters in connection URLs.
- Env files are `chmod 600` and git-ignored; the `docker` group can read all container env. TODO: move to Docker/Compose `secrets:` if the stack grows (the app reads env vars only, so a file-to-env wrapper would be needed).

## Troubleshooting
| Symptom | Check |
|---|---|
| Caddy cannot get a cert | DNS points here? 80/443 open and free? `docker compose logs caddy`; do not restart in a loop (rate limits). Keep `caddy-data`. |
| 502 from Caddy | `./deploy.sh status`; `docker compose logs api`. Usually bad env (Cloudinary/Clerk), DB unreachable, or Redis password mismatch. |
| API restarts in a loop | `docker compose logs --tail=100 api`; missing `CLOUDINARY_URL`, bad `DATABASE_URL`. |
| `ECONNREFUSED` / DB timeouts | Neon compute waking (retry ~30 s); IP allow-list; `/api/health/deep`. |
| Realtime/chat not updating | Redis healthy? `/api/health/deep` shows `redis`. A proxy/CDN blocking WebSocket? Path `/api/socket`. More than one active API server (see Second server)? |
| Everyone rate-limited | Wrong client IP: `trust proxy` hop count vs Cloudflare (assumption 4). |
| Redis auth errors | `REDIS_PASSWORD` is used for both Redis and the `REDIS_URL` compose builds; `$` needs `$$`. |
| Deploy says "another deploy is running" | `.state/lock` (flock) is held by a live deploy; with no flock installed remove `.state/lock.d` if stale. |
| Disk full | `docker system df`; `deploy.sh` already prunes old tags. Logs capped at 5x10 MB per container. |
| Validate Caddy | `docker run --rm -e API_DOMAIN=api.example.com -e ACME_EMAIL=a@b.c -v "$PWD/caddy:/c:ro" caddy:2-alpine caddy validate --config /c/Caddyfile` |
