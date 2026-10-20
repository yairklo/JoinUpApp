# JoinUp deployment runbook

Deployment as code for the Docker + Caddy VPS setup. Nothing here contains secrets; real values live only in
`deploy/.env`, `deploy/api.env`, `deploy/web.env` on the server (git-ignored).

```
Internet -> Caddy (:80/:443, TLS, gzip/zstd) -> api:3005  (Express + Socket.IO at /api/socket)
                                             -> web:3000  (Next.js, optional profile "web")
            api/worker -> redis:6379 (internal)      api/worker -> Postgres (EXTERNAL, DATABASE_URL)
```

| File | Purpose |
|---|---|
| `docker-compose.yml` | api, worker (profile), web (profile), redis, caddy; healthchecks, `restart: unless-stopped`, log rotation |
| `docker-compose.prod.yml` | memory/CPU ceilings (tune to VPS size) |
| `caddy/Caddyfile` | TLS, reverse proxy, WebSocket, compression, headers |
| `web.Dockerfile` | Next.js image (new; the repo had none) |
| `deploy.sh` | deploy / rollback / status / logs / migrate |
| `*.env.example` | every env var name the code reads |

## Facts taken from the repo
- API: `server/Dockerfile` (node:20-alpine, port **3005**, has curl), liveness `GET /api/health` (no DB), readiness `GET /api/health/deep` (DB + Redis; do not poll tightly).
- Socket.IO path is `/api/socket`; Express uses `trust proxy = 1` (one proxy hop = Caddy).
- `worker.js` runs jobs without the HTTP server; `RUN_BACKGROUND_JOBS=false` disables jobs in the API process.
- Prisma needs `DATABASE_URL` and `DIRECT_DATABASE_URL`. The image CMD runs `prisma migrate deploy` on boot; compose overrides the command to `node index.js` so migrations are an explicit step in `deploy.sh`.
- CI (`.github/workflows/ci.yml`) only builds/tests; there is no image build, registry or deploy workflow.
- Uploads go to Cloudinary (server refuses to boot without `CLOUDINARY_URL` in production); container disk is ephemeral.

## Assumptions / TODOs - please confirm
1. **Web hosting**: `VERCEL_URL` is referenced in `next_app`, so the web app may be on Vercel, not the VPS. The `web` profile is therefore opt-in and `web.Dockerfile` is **untested** here. If web stays on Vercel, delete the `WEB_DOMAIN` block in the Caddyfile.
2. **API domain**: `joinup-api.duckdns.org` is inferred from a test file; set the real `API_DOMAIN`.
3. **Postgres is external** (Neon is mentioned in repo docs/comments). No DB container is provided. TODO: record the provider, backup/PITR policy and how to restore.
4. **Redis** is a fresh password-protected, non-persistent container (data is ephemeral: pub/sub, rate limits); the existing VPS may run one differently.
5. **Cloudflare / DNS-proxy**: not known. If the API is behind Cloudflare, set `TRUST_CF_CONNECTING_IP=true` and note that `trust proxy = 1` then sees Cloudflare, not Caddy, as the client hop; verify real client IPs in logs.
6. Existing VPS firewall, Docker version, volume names and any current compose file are unknown; compare with the live server before cutover (`docker ps`, `docker inspect`, current Caddyfile) and reconcile differences here.
7. Memory limits in the prod override assume ~2 GB RAM.
8. Image tags are built **on the server** (no registry). TODO: add a CI build+push to GHCR and switch `image:` to the registry path for faster, reproducible deploys.

## Cutover from the existing hand-built VPS
Ports 80/443 and container names will clash with the running stack, so do this in a maintenance window (a few minutes of downtime).
1. **Inspect the live setup first**: `docker ps -a`, `docker volume ls`, `docker inspect <caddy>` (mounts, networks), the live Caddyfile and any compose file / `docker run` flags (`history | grep docker`), and the env of the API container. Reconcile differences into `deploy/` (domains, paths, extra services).
2. Clone the repo on the server; create `.env`, `api.env` (copy values from the live API container: `docker inspect <api> --format '{{json .Config.Env}}'`; never paste them into chat or git) and a new `REDIS_PASSWORD`.
3. **Keep TLS certs** by copying the old Caddy data volume into the new one (compose project name is `joinup`):
   `docker volume create joinup_caddy-data && docker run --rm -v <old_caddy_data_volume>:/from -v joinup_caddy-data:/to alpine cp -a /from/. /to/`
4. Build without starting: `cd deploy && IMAGE_TAG=cutover docker compose build`; validate with `docker compose config -q`.
5. Note the old container names/run commands, then stop the old stack (`docker stop <caddy> <api> ...`; do not `rm` or prune, keep volumes and images).
6. `./deploy.sh deploy`; verify `/api/health`, `/api/health/deep`, a WebSocket chat, the web app.
7. **Fail back** if it does not work: `docker compose down` in `deploy/` (keeps volumes), then `docker start <old containers>` and investigate while the old stack serves.
8. After a stable period (days), remove the old containers and volumes.

## First-time provisioning of a new server
1. Ubuntu LTS VPS; create a non-root sudo user; SSH keys only; `ufw allow 22,80,443/tcp` and `443/udp`, then enable.
2. Install Docker Engine + Compose plugin (https://docs.docker.com/engine/install/ubuntu/) and add the user to the `docker` group. Install git.
3. DNS: point `API_DOMAIN` (and `WEB_DOMAIN` if used) A/AAAA to the server **before** starting, or Caddy's ACME challenge fails.
4. `git clone https://github.com/yairklo/JoinUpApp.git /opt/joinup && cd /opt/joinup/deploy`
5. `cp .env.example .env; cp api.env.example api.env` (and `cp web.env.example web.env` for web). Fill values from the password manager / existing server. `chmod 600 *.env`.
6. Allow the new server's IP in the Postgres provider (if IP allow-listing is used).
7. `./deploy.sh deploy` (builds, migrates, starts, waits for health).
8. Verify: `curl -fsS https://$API_DOMAIN/api/health` and `/api/health/deep`; open the web app; join a game chat to confirm WebSockets.
9. Optional: `sudo systemctl enable docker` (default on Ubuntu) so containers return after a reboot (`restart: unless-stopped`).

## Deploy
```bash
cd /opt/joinup/deploy
./deploy.sh deploy            # origin/main
./deploy.sh deploy <sha|tag>  # a specific commit
```
It fetches, checks out the commit detached, builds images tagged with the 12-char SHA, runs `prisma migrate deploy`, runs `docker compose up -d --wait`, and records `.state/current` and `.state/previous` (a failed sha goes to `.state/failed`). If the new containers are not healthy it restarts the previous tag automatically (database not reverted). Pre-deploy checklist: CI green, new migrations reviewed (see below), DB backup/branch taken if a migration is destructive.

## Rollback
```bash
./deploy.sh rollback          # previous successful deploy
./deploy.sh rollback <sha>    # any tag still present (docker images | grep joinup-api); rebuilds from git if missing
```
This swaps container images only and takes ~seconds. Caddy/redis are untouched. **It does not undo migrations.**

### Database migrations and rollback (Prisma)
Prisma has no "down" migrations. Rolling code back leaves the newer schema in place, which is fine only if the old code tolerates it.
- **Additive migrations** (new nullable column/table/index): safe, old code ignores them. Rollback freely.
- **Destructive or renaming migrations** (drop/rename column or table, new NOT NULL without default, type changes): old code will break. Prefer expand/contract: ship the additive step, deploy code, remove the old column in a later release.
- Before any destructive migration, take a restore point (provider branch/snapshot or `pg_dump "$DIRECT_DATABASE_URL" -Fc -f backup.dump`).
- If a migration fails mid-way: `deploy.sh` stops before restarting containers (old version keeps serving). Fix forward with a new migration, or mark state with `npx prisma migrate resolve --applied|--rolled-back <name>` after repairing the DB by hand. Never edit an applied migration file.
- True revert = write a new corrective migration, or restore the pre-migration backup (loses data written since).
- Running `migrate deploy` from two servers at once is safe (Prisma takes an advisory lock), but still deploy servers one at a time.

## Add a second server
Both servers share the same external Postgres and **the same Redis** (Socket.IO fan-out and rate limits need one Redis).
1. Provision as above. Point both servers' `REDIS_URL` at one Redis: either keep the Redis on server A, exposed only over a private network/firewall allow-list, or use a managed Redis. Edit `REDIS_URL` in `docker-compose.yml` (or move it to `api.env`) and remove/disable the local `redis` service on server B. TODO: this is not parameterised yet.
2. Put a load balancer or DNS round-robin in front. Socket.IO with polling transport needs sticky sessions; with WebSocket-only clients it does not. Check the client transport config before enabling round-robin.
3. **Worker profile**: when `COMPOSE_PROFILES` includes `worker`, every `api` instance must set `RUN_BACKGROUND_JOBS=false` (otherwise jobs run twice), and the worker needs `REDIS_URL` (compose sets it) so live socket events reach the API. For several API instances (api1/api2) see the commented sticky-session `reverse_proxy` example in `caddy/Caddyfile`. Run background jobs on exactly one box: set `RUN_BACKGROUND_JOBS=false` in `api.env` on server B (or run `COMPOSE_PROFILES=worker` on one server and disable jobs in all `api` containers). Job claims are idempotent per the code, but avoid duplicates anyway.
4. Deploy servers sequentially (`deploy.sh deploy <same sha>`), checking health between them.

## Troubleshooting
| Symptom | Check |
|---|---|
| Caddy cannot get a cert | DNS points here? ports 80/443 open? `docker compose logs caddy`; avoid repeated restarts (rate limits). Keep `caddy-data` volume. |
| 502 from Caddy | `./deploy.sh status`; `docker compose logs api`. API unhealthy usually = bad env (Cloudinary/Clerk missing makes boot fail) or DB unreachable. |
| API restarts in a loop | `docker compose logs --tail=100 api`; missing `CLOUDINARY_URL`, bad `DATABASE_URL`, Redis down. |
| `ECONNREFUSED` / DB timeouts | Neon compute may be waking up; retry after ~30 s. Check `/api/health/deep`; check IP allow-list. |
| Realtime/chat not updating | Redis container healthy? `/api/health/deep` shows `redis`. WebSocket blocked by a proxy/CDN in front? Path is `/api/socket`. |
| Redis auth errors | `REDIS_PASSWORD` in `.env` is used for both Redis and the `REDIS_URL` compose builds for api/worker. |
| Rate limiting hits everyone | Wrong client IP: `trust proxy` hop count vs Cloudflare (see assumption 5). |
| Migration fails on deploy | Output of `deploy.sh migrate`; see "Database migrations and rollback". |
| Disk full | `docker system df`; `docker image prune -a` (keep the current + previous tags!). Logs are capped at 5x10 MB per container. |
| Validate config | `docker compose config -q` in `deploy/`; Caddy: `docker run --rm -e API_DOMAIN=x.example -e WEB_DOMAIN=y.example -e ACME_EMAIL=a@b.c -v "$PWD/caddy:/c:ro" caddy:2-alpine caddy validate --config /c/Caddyfile` |
