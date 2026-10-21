# Running the API on several instances in Coolify

Plan and runbook for running the multi-instance code from [#370](https://github.com/yairklo/JoinUpApp/pull/370) (Redis Socket.IO adapter, shared limiters, job leader lock) on the existing Coolify VPS. Style and conventions follow the dev runbook from [#373](https://github.com/yairklo/JoinUpApp/pull/373) (`docs/dev-environment.md`, now on `main`).

**This document is mostly a plan.** The multi-instance phases (Redis flags, second app, sticky LB) were not run anywhere. Facts that were checked on the real dev environment are collected in [section 11](#11-what-we-confirmed-on-the-real-dev-environment) and in A8. Every other Coolify statement is from the official docs (cited in [Sources](#sources)); anything the docs do not settle is listed under [Open questions](#open-questions-only-the-owner-can-answer) and marked **VERIFY** inline.

Depends on #370 being merged and deployed. PR #366 (own Caddy/compose/`deploy.sh`) is closed and is not used: Coolify already owns ports 80/443, TLS and deploys.

## Contents

1. [Assumptions to verify first](#1-assumptions-to-verify-first)
2. [What Coolify supports (and what it does not)](#2-what-coolify-supports-and-what-it-does-not)
3. [Target architecture](#3-target-architecture)
4. [Environment variables per instance](#4-environment-variables-per-instance)
5. [Rollout phases with checks](#5-rollout-phases-with-checks)
6. [Rollback matrix](#6-rollback-matrix)
7. [Deploys, health check, graceful shutdown](#7-deploys-health-check-graceful-shutdown)
8. [DuckDNS and TLS](#8-duckdns-and-tls)
9. [Adding a second server later](#9-adding-a-second-server-later)
10. [Risks](#10-risks)
11. [What we confirmed on the real dev environment](#11-what-we-confirmed-on-the-real-dev-environment)
12. [Open questions only the owner can answer](#open-questions-only-the-owner-can-answer)
13. [Sources](#sources)

## 1. Assumptions to verify first

Assumed: a self-hosted **Coolify v4** (current docs at coolify.io, fall 2026; the exact version is unknown — read it at the bottom of the Coolify sidebar or **Settings → Update**). Single VPS, the production API as one **Application** (Dockerfile build pack, port `3005`, domain `joinup-api.duckdns.org`), Neon Postgres, no Cloudflare.

Verify each before phase 1 and write the answers into the PR / a note:

| # | Question | How to check |
|---|---|---|
| A1 | Coolify version | Bottom of the left sidebar, or **Settings → Update**. Note it. |
| A2 | Proxy is **Traefik** (default) or Caddy | **Servers → (your server) → Proxy**. The page header shows the proxy type; the **Configuration** tab shows a compose file with `traefik` (or `caddy`) as the image. On the VPS: `docker ps --format '{{.Names}} {{.Image}}' \| grep proxy` shows `coolify-proxy traefik:vX`. Everything below assumes Traefik. If it is Caddy, section 3 labels/config change; stop and ask. |
| A3 | Production app's Base Directory + Dockerfile location | Production app → **General → Build**. Same pair as #373 describes. |
| A4 | Production app has a **domain** set and **Port** `3005` | Production app → **General**. |
| A5 | Health check on the production app | Production app → **Healthcheck**: Enabled, GET, path `/api/health`, port `3005`. |
| A6 | **Stop Grace Period** | Production app → **Advanced → Operations**. Docs default is 30 s. #370's drain forces exit at 10 s, so ≥15 s is enough. |
| A7 | Rolling update is actually happening | Production app → **Deployments** → open the latest log; look for "Rolling update started … completed". Forced stop-first when a host port is published, a custom container name or `--ip` is set ([docs](https://coolify.io/docs/knowledge-base/rolling-updates)). |
| A8 | SIGTERM reaches Node (so #370's drain runs) | **Verified, no change needed.** With `node:20-alpine` both the old shell-form `CMD npx prisma migrate deploy && npm start` and #373's exec form deliver SIGTERM (busybox `sh` execs the last command). Checked locally with `docker stop`: `[SHUTDOWN] SIGTERM received, draining...` then `[SHUTDOWN] done`, exit 0, for both. Process tree: `npm start` → `node scripts/render-start.js` (requires `index.js` in the same process). Still confirm `[SHUTDOWN]` in logs on a Restart of the container (see section 11). |
| A9 | Compute resources | One VPS running Coolify, the proxy, two API containers, Redis. Check RAM (`free -m`) — each Node API ≈ a few hundred MB; Redis was sized in #370 at 128 MB. |
| A10 | Coolify's Docker network for the app | Production app → **Configuration** shows the **Destination** (usually network `coolify`). Redis must use the same destination. |
| A11 | Is the production Neon compute / connection limit OK for 2 instances | Prisma pool size × 2 must fit Neon's pooled limit. Check Neon console → project → **Connection pooling**. |

## 2. What Coolify supports (and what it does not)

| Topic | Finding | Source |
|---|---|---|
| **Redis resource** | **+ New → Database → Redis**, pick server and Docker network destination. Coolify generates a password and an *internal* URL `redis://default:<password>@<container-name>:6379/0` (username `default`). Default image `redis:7.2`, changeable under General. Data lives in a volume at `/data`, so it persists across container recreation; Coolify's scheduled backups do **not** support Redis. Private by default; **Public access** is an opt-in toggle (leave off). | [Redis](https://coolify.io/docs/databases/redis) |
| **Valkey** | Not described on the Redis page. A Valkey/Redis-compatible image could be set in General, but the docs do not endorse it — **VERIFY** if you want it; use the default Redis. | same |
| **Replicas of one app** | The docs describe **no replica count** for an Application. Documented scaling is (a) bigger server, (b) the same image on **multiple attached servers**, (c) your own load balancer; Docker Swarm is deprecated. | [Scaling](https://coolify.io/docs/core/infrastructure/scaling/overview) |
| **Several containers on one server** | The Traefik load-balancing page covers spreading one domain across several upstreams (containers on one host or other hosts), configured as a **dynamic config file** in **Servers → (server) → Proxy → Dynamic Configurations**. It needs ≥2 healthy upstreams reachable from `coolify-proxy`. | [Traefik load balancing](https://coolify.io/docs/knowledge-base/proxy/traefik/load-balancing) |
| **Sticky sessions** | The Coolify load-balancing page does **not** mention session affinity. Traefik itself supports cookie stickiness (`sticky.cookie` on a `loadBalancer`), also in file-provider config. So it is a Traefik feature we add to the dynamic file; Coolify does not document or test it. | [Traefik docs](https://doc.traefik.io/traefik/expose/docker/advanced/) |
| **WebSocket upgrade** | Traefik forwards `Upgrade: websocket` natively; no router flag is needed. Not specifically covered in Coolify docs — **VERIFY** in phase 4. | — |
| **Proxy dynamic config** | Files live in `/data/coolify/proxy/dynamic/` on the host, mounted at `/traefik/dynamic/`; Traefik watches them, no restart. Main proxy compose edits need a proxy restart and can be overwritten if edited on disk instead of in the UI. | [Traefik overview](https://coolify.io/docs/knowledge-base/proxy/traefik/overview) |
| **Rolling updates** | Dockerfile apps: Coolify starts the new container, waits for the health check, then stops the old one. Both versions run briefly; the docs say the app must tolerate parallel instances "especially schedulers" and shut down gracefully. Not supported for Docker Compose. Stop Grace Period: **Advanced → Operations**, default 30 s, range 1–3600 s. | [Rolling updates](https://coolify.io/docs/knowledge-base/rolling-updates) |
| **Health check** | Fields: method, scheme, host, port, path, interval, timeout, retries, start period. | [Health checks](https://coolify.io/docs/knowledge-base/health-checks) |
| **Second server** | See [section 9](#9-adding-a-second-server-later). | [Servers](https://coolify.io/docs/knowledge-base/server/introduction) |

**Consequence:** the cleanest same-server layout is **two Application resources built from the same repo/branch** (`joinup-api-1` = today's production resource, `joinup-api-2` = a clone) behind a Traefik **load-balancer service** defined in the proxy's dynamic config with a sticky cookie. A single Application with a "replicas = 2" field is not documented; do not look for one.

## 3. Target architecture

```
Internet ──TLS──> coolify-proxy (Traefik)
                    router: Host(joinup-api.duckdns.org)
                    service: joinup-api-lb  (sticky cookie, health /api/health)
                      ├─> joinup-api-1:3005   (Coolify app 1)
                      └─> joinup-api-2:3005   (Coolify app 2)
Both apps ──private Docker network──> Redis (Coolify DB resource)  ──> Neon Postgres (external)
```

- API code expects exactly **one proxy hop** (`app.set('trust proxy', 1)` in `server/index.js`). Traefik is that one hop; do not add another proxy in front (no Cloudflare). Rate limits key on client IP from `X-Forwarded-For`.
- Socket.IO path is `/api/socket`, transports `['polling','websocket']`, so mobile does polling first, then upgrades. A polling client sends several requests with the same `sid`; they must reach the same instance until the upgrade completes. That is the only reason stickiness is needed; the Redis adapter handles cross-instance delivery after.
- **Stable upstream names.** Coolify names containers `<uuid>-<deployment id>` and a rolling update creates a new name each deploy, so a static `http://<container>:3005` in the dynamic file would break after every deploy. Use a stable **network alias** per app. **VERIFY**: Coolify application → **Advanced → Network → Custom Network Aliases** (field name varies by version). If your version has no such field, use `--network-alias joinup-api-1` in **Custom Docker Options**. Do **not** use a custom container name: that forces stop-first deploys (kills zero-downtime) per the rolling-update docs.
- Neither app has a domain set in Coolify once the LB is live (otherwise Coolify's generated router for the same `Host` conflicts: "remove any other resource route using the same hostname", Traefik LB doc). Health still works: it is Docker-level, not proxy-level.

### Dynamic config (template — adapt from the official page, do not paste blind)

Create at **Servers → (server) → Proxy → Dynamic Configurations → Add**, file `joinup-api-lb.yaml`. Start from the HTTPS tab of the [Coolify load-balancing page](https://coolify.io/docs/knowledge-base/proxy/traefik/load-balancing) to get the exact entrypoint and cert-resolver names Coolify uses on your install (`https`, `letsencrypt` in the default proxy compose — check **Proxy → Configuration**), then add the `sticky` block:

```yaml
http:
  routers:
    joinup-api-lb:
      rule: Host(`joinup-api.duckdns.org`)
      entryPoints: [https]            # as in your proxy configuration
      service: joinup-api-lb
      tls:
        certResolver: letsencrypt     # as in your proxy configuration
  services:
    joinup-api-lb:
      loadBalancer:
        sticky:
          cookie:
            name: joinup_lb
            secure: true
            httpOnly: true
            sameSite: none            # mobile/web cross-site; web is on Vercel
        healthCheck:
          path: /api/health           # never /api/health/deep
          interval: 5s
          timeout: 2s
        servers:
          - url: http://joinup-api-1:3005
          - url: http://joinup-api-2:3005
```

Notes: `sameSite: none` needs `secure: true` and is only relevant to browsers; React Native keeps cookies per its HTTP stack — see risk R3. Traefik health-check removes a failing server from rotation; with a sticky cookie pointing at a dead server it re-pins to a healthy one (Traefik docs). Add `http-only` entrypoint redirect is already done by Coolify's proxy.

## 4. Environment variables per instance

**Must be identical on both instances** (set via the Coolify resource's Environment Variables; for the second app, copy them — or use Coolify's **Shared Variables** (Team/Project/Environment level) with `{{project.REDIS_URL}}` so they cannot drift — **VERIFY** the syntax in your version):

| Variable | Value | Why |
|---|---|---|
| `REDIS_URL` | Coolify Redis **internal** URL | one shared Redis; everything below needs it |
| `SOCKET_ADAPTER` | `redis` | cross-instance emits |
| `RATE_LIMIT_STORE` | `redis` | shared HTTP limiter |
| `CHAT_RATE_STORE` | `redis` | shared chat limiter |
| `CHAT_DEDUPE_STORE` | `redis` | tempId idempotency across instances |
| `JOBS_LEADER_LOCK` | `redis` | one instance runs jobs |
| `JOBS_LEADER_TTL_MS` | unset (default 30000) | must be equal on all instances |
| `GRACEFUL_SHUTDOWN` | unset (on). `false` to disable the drain | emergency only |
| `REDIS_KEY_PREFIX`, `SOCKET_ADAPTER_KEY` | unset (defaults `joinup:` / `joinup-socket`) | instances must share them. A different value splits the cluster |
| `DATABASE_URL`, `DIRECT_DATABASE_URL`, `CLERK_*`, `CLOUDINARY_*`, `PUBLIC_SERVER_URL`, `CORS_ORIGINS`, Firebase, `SENTRY_*`, etc. | same as today | same app, same data |
| `RUN_BACKGROUND_JOBS` | unset/`true` on **both** once `JOBS_LEADER_LOCK=redis` | the lock decides who runs; `false` on one is also safe but unnecessary |

**Unique per instance:** nothing required. The leader-lock instance id is generated (`hostname:pid:random`); Coolify gives each container a different hostname. `PORT=3005` on both. `SENTRY_*` could add an instance tag; optional.

**Do not** put the production `REDIS_URL` on the dev resource ([#373](https://github.com/yairklo/JoinUpApp/pull/373) explains why: the bridge channels `joinup:socket_events` / `joinup:scheduler_events` would cross environments). If dev ever gets Redis, give it its own Redis resource, or at minimum a different `REDIS_KEY_PREFIX` **and** `SOCKET_ADAPTER_KEY`.

Redis resource settings (**+ New → Database → Redis**, same Destination as the API):

- Keep **Public access off**. The API connects by the internal name.
- Password: leave the generated one; it is already inside the internal URL. Copy the **Redis URL (internal)**.
- Persistence: everything JoinUp stores in Redis is ephemeral (rate counters, 60 s-ish tempId markers, the leader lock, pub/sub). The Coolify volume persisting is harmless. If you want no AOF, set the Redis start command / custom config to `--appendonly no --maxmemory 128mb --maxmemory-policy volatile-lru` (matching #370's intent) — **VERIFY** the field name in the Redis resource's **General** tab. `volatile-lru` is required so the lock key (which has a TTL) is the only thing ever evicted, never non-TTL keys; `allkeys-*` policies could evict the lock under pressure.
- Health: the Redis resource card shows running/healthy. From the VPS: `docker exec <redis container> redis-cli -a '<pw>' ping` → `PONG` (container name is on the Redis resource page; do not paste the password into shared logs).

## 5. Rollout phases with checks

Never skip a phase; each has an exit check and a rollback (section 6). Do phases 1–3 on **one instance**, in a quiet window.

### Phase 0 — ship #370 with flags off

1. #370 and #373 are already on `main`; confirm the deployed image includes them (the `HEALTHCHECK` from #373 should show as "Custom healthcheck found in Dockerfile" in the deploy log).
2. Coolify auto-deploys. Do **not** set any new variable.
3. Check: deployment log shows "Rolling update completed"; `curl -fsS https://joinup-api.duckdns.org/api/health` → `"status":"OK"`, `"jobs":"on"`. App behaves as before.

### Phase 1 — Redis + limiter flags + adapter, one instance

1. **+ New → Database → Redis** as above; Start; wait healthy.
2. On the production app add `REDIS_URL`. Redeploy (flags still off). Check logs: no Redis errors (bridge now connects to Redis — `[BOOT]`/bridge lines in logs).
3. In order, one redeploy each (or batch, but separate steps help diagnosis): `RATE_LIMIT_STORE=redis`, `CHAT_RATE_STORE=redis`, `CHAT_DEDUPE_STORE=redis`, then `SOCKET_ADAPTER=redis`.
4. **Checks**
   - `curl -s https://joinup-api.duckdns.org/api/health/deep` **once, by hand** (it touches Postgres/Redis; never poll it): `redis:"up"`, `socketAdapter` reports on.
   - Keys in Redis (on the VPS): `docker exec <redis> redis-cli -a '<pw>' --scan --pattern 'joinup:*' | head` — expect `joinup:rl:*` after some API traffic, `joinup:chatrl:<userId>` after a chat send, `joinup:tempid:*` briefly (short TTL). Use `--scan`, never `KEYS` (blocks Redis).
   - Logs contain no `[socket-adapter] … failed` / `store error, allowing request` lines.
   - Open the web app and the mobile app: login, open a chat, send a message, see it appear (single instance; just proves nothing broke).
5. **Exit:** 30+ minutes of normal use with no new errors in Sentry or logs.

### Phase 2 — leader lock

1. Set `JOBS_LEADER_LOCK=redis` on the single instance, redeploy.
2. Checks:
   - Logs: `[JOBS] leader lock enabled (instance …)` and `[leader-lock] … acquired job leadership`.
   - `/api/health` → `"jobs":"on"` (leader). `redis-cli GET joinup:jobs:leader` returns the instance id; `PTTL joinup:jobs:leader` stays between 0 and 30000 and keeps being refreshed (run it twice a few seconds apart).
   - Scheduled jobs still fire at their next due time (check a game reminder / lottery in logs).
3. **Rule:** never run an instance with jobs enabled and **no** lock next to lock-mode instances. Both instances must carry the flag before the second goes live.

### Phase 3 — second instance, direct (no LB yet)

1. Clone the production app: Coolify → production app → **⋯ → Duplicate** (**VERIFY** name; otherwise **+ New → Application** with the same repo/branch/base directory/Dockerfile pair/port/health check). Name `joinup-api-2`.
2. Copy **all** environment variables from app 1 (or use shared variables). Give it a temporary public domain `joinup-api2.duckdns.org` (add the DuckDNS record, section 8) so you can test it alone. Set a network alias `joinup-api-2`; on app 1 set `joinup-api-1`; redeploy both.
3. Checks:
   - `curl https://joinup-api2.duckdns.org/api/health` → `"jobs":"standby"`; app 1's `/api/health` → `"jobs":"on"`.
   - Logs on app 2: `[leader-lock] … ` standby; no job output.
   - **Cross-instance chat:** open web chat on `joinup-api.duckdns.org`'s instance and a second client pointed at `NEXT_PUBLIC_API_URL=https://joinup-api2.duckdns.org` (a Vercel preview or local web with that env). Send a message from each; each must appear on the other exactly once, with `delivered`. Duplicates → adapter + bridge both delivering; unset `SOCKET_ADAPTER` and report to #370 owners.
   - **Failover:** in Coolify stop app 1 (**Stop**). Within ~`JOBS_LEADER_TTL_MS` (30 s) app 2's `/api/health` flips to `"jobs":"on"` and logs `acquired job leadership`. Start app 1 again → `standby`. Nothing should run twice.
4. Remove the temporary domain from app 2 only when phase 4 is ready (or keep it as a debug endpoint during the test, then remove).

### Phase 4 — sticky load balancer

1. Remove the domain from app 1 only at cutover (there is a short window; do it off-peak). First, test the LB on a **test hostname**: edit the template's rule to `Host(\`joinup-lb-test.duckdns.org\`)`, add the DuckDNS record, save the file, and test.
2. Checks on the test hostname:
   - `curl -sI https://joinup-lb-test.duckdns.org/api/health` shows `Set-Cookie: joinup_lb=…` (verifies stickiness cookie is issued).
   - Reuse the cookie: `curl -s -c jar https://…/api/health` then `curl -s -b jar https://…/api/health` several times — `jobs` value stays the same (same backend). Without `-b`, requests alternate between `on` and `standby`.
   - Socket.IO polling then upgrade: browser devtools → Network → WS, or `curl -s 'https://…/api/socket/?EIO=4&transport=polling'` gives an `sid`; a second request with the same `sid` **and the cookie** must return data, not `{"code":1,"message":"Session ID unknown"}`. Without the cookie, a request that lands on the other instance gives exactly that error — that is what stickiness prevents.
   - From a real phone (iOS and Android): chat live-update works, including after backgrounding the app. Check logs of both instances for `transport` upgrade lines / no reconnect storm.
3. **Cutover:** remove the domain from app 1 (Configuration → Domains → clear, save, redeploy), change the file's `Host` to `joinup-api.duckdns.org`. Traefik hot-reloads the file. Verify `https://joinup-api.duckdns.org/api/health` and app login within a minute. If anything is off, jump to the rollback matrix (restore the domain on app 1, delete the file).
4. Remove the temporary domains for app 2 and the test hostname.

### Phase 5 — load test and rolling deploy

1. Rolling deploy test: trigger a redeploy of app 2, then app 1, **one at a time**, while a client holds a chat open. Logs show `[SHUTDOWN] SIGTERM received, draining…` then `[SHUTDOWN] done`; the client reconnects to the other instance; no lost message (tempId dedupe).
2. Load test before the campaign: a simple Socket.IO script (e.g. `artillery` with the socketio engine) against the **dev/test hostname**, not production without notice: ramp connections, check CPU/RAM on the VPS, Redis `INFO stats` (`instantaneous_ops_per_sec`), Neon connections, p95 latency, and 429s (the limiter now counts in Redis; check the client IP is the real one, not Traefik's, otherwise everyone shares one bucket).
3. Record results; only then green-light the campaign.

## 6. Rollback matrix

Flags can be changed in any order; each change = edit variable → **Redeploy** (env changes are applied at container start). Unset is equivalent to the default (memory/off).

| Symptom | Action | Notes |
|---|---|---|
| Anything wrong, want single-instance behaviour | Unset all of `SOCKET_ADAPTER`, `RATE_LIMIT_STORE`, `CHAT_RATE_STORE`, `CHAT_DEDUPE_STORE`, `JOBS_LEADER_LOCK`; stop app 2; restore app 1 domain; delete the LB file | Redis can stay up, unused |
| LB broken / site unreachable | Delete `joinup-api-lb.yaml` in Proxy → Dynamic Configurations (Traefik reloads at once) **and** put `joinup-api.duckdns.org` back on app 1 → redeploy | Fastest path: the domain on app 1 |
| Duplicate chat events | Unset `SOCKET_ADAPTER` | |
| 429 storm | `RATE_LIMIT_STORE=memory` (or unset); check `X-Forwarded-For` / `trust proxy` first | |
| Duplicated job effects (two leaders) | Unset `JOBS_LEADER_LOCK`, then set `RUN_BACKGROUND_JOBS=false` on all but one instance | Stop app 2 first |
| Redis unreachable | Nothing to do immediately: limiters fail open, chat falls back locally, standby does not run jobs (delay, not duplicates). If it lasts, unset flags as above | |
| Bad code deploy | App → **Deployments** → pick the last good deployment → **Redeploy** / **Rollback** (**VERIFY** the label in your version; Coolify keeps images of previous deployments only if **Advanced → Keep images** / retention allows). Fallback: revert the commit on `main` and let Auto Deploy build it | Both apps must roll back to the same commit |
| Graceful shutdown misbehaves | `GRACEFUL_SHUTDOWN=false` | Only if the drain itself hangs; deploys then cut sockets |

## 7. Deploys, health check, graceful shutdown

- **Health check** (each app): the image already declares a Docker `HEALTHCHECK` (from #373: `curl http://127.0.0.1:${PORT:-3005}/api/health`, start period 40 s); Coolify detects it ("Custom healthcheck found in Dockerfile") and uses it for rolling updates, so no UI health check is strictly required. If you set one in the UI instead: GET, scheme http, host `localhost`, port `3005`, path `/api/health`. Interval 10 s, timeout 5 s, retries 3, start period ≥ 40 s (Prisma migrations run before listen). **Never `/api/health/deep`**: it queries Postgres and keeps the Neon compute awake. `/api/health` is dependency-free and returns `jobs: on|standby|off`, which doubles as a leader indicator.
- **Rolling update**: with the health check, Coolify starts the new container, waits for healthy, then stops the old one. Both run together briefly: acceptable, because jobs are behind the Redis lock, the Socket.IO adapter makes both deliver, and the limiter is shared. Migrations are run by whichever container boots first; Prisma `migrate deploy` takes an advisory lock, so a concurrent boot waits. **Do not deploy both apps at the same moment** — redeploy one, wait healthy, then the other, to keep one instance serving.
- **Graceful shutdown**: SIGTERM → #370 drains (release leader lock, close Socket.IO, adapter, Redis, Prisma), hard timeout **10 s** in code. Coolify **Stop Grace Period** (default 30 s) is longer, so it never kills mid-drain; leave 30 s or set 15 s. A lapsed lock expires on its own within 30 s if the old container is killed hard, so a stuck drain costs a delay in jobs, not duplicates. Node does receive SIGTERM in our image (A8, verified).
- Stop-first deploys (host port published, custom container name, `--ip`) defeat all of this; do not set them on the API apps.
- Coolify deploys each app independently on push to `main`. With **Auto Deploy** on both, the two deploys start together. Prefer turning Auto Deploy **off** on app 2 and deploying it from the UI after app 1 is healthy (**VERIFY** stagger option in your version), or use a deploy webhook for app 2 invoked after app 1 finishes.

## 8. DuckDNS and TLS

- DuckDNS `A` record `joinup-api` → VPS public IP stays unchanged: all traffic enters the one proxy, which then fans out. Extra names (`joinup-api2`, `joinup-lb-test`) point at the **same IP**; remove them after testing.
- TLS: Traefik's ACME resolver gets a Let's Encrypt cert through the HTTP-01 challenge on port 80 (needs 80/443 open, which Coolify already requires). A file-provider router must reference the resolver by the same name as the proxy configuration (`letsencrypt` by default — check **Proxy → Configuration**). Certs are stored in `/data/coolify/proxy/acme.json`.
- The cert for `joinup-api.duckdns.org` already exists. When you move the router from Coolify's generated labels to the dynamic file, Traefik may re-request it; with a rate limit of 5 duplicate certs per week, avoid repeating cutover/rollback cycles many times in one week (use the test hostname for experiments).
- DuckDNS is a free DNS service without SLA; for a campaign consider a real domain later (not part of this plan).

## 9. Adding a second server later

Per [Servers](https://coolify.io/docs/knowledge-base/server/introduction) and [Scaling](https://coolify.io/docs/core/infrastructure/scaling/overview):

1. Add a fresh Linux server: **Servers → + Add** (SSH key, IP; or let Coolify provision on Hetzner etc.). **Validate**: this installs/verifies Docker and can restart the Docker service, so use a fresh machine.
2. Set a **Docker registry** on the application (Application → **General → Docker Registry**) so images built on the primary server are pushed and pulled by the other server. The app must not use Coolify-managed persistent storage (the API has none).
3. Application → **Servers** → attach the new server; Coolify deploys the same image there. Env vars are shared (the same set), so `REDIS_URL` must now be reachable **from the other server**: Redis on server 1 needs either public access with a password + TLS (`rediss://`, port 6380, Redis resource → SSL) restricted by firewall to server 2's IP, or a private network (e.g. provider VLAN/WireGuard). Do not expose Redis to the internet without TLS and a firewall rule. #370 states multi-host Redis TLS was not verified.
4. The load balancer is then no longer Coolify's single proxy: Traefik on server 1 can list `http://<server2 ip or private name>:3005` as an upstream (the upstream must be reachable from `coolify-proxy`; mind firewall and use a private network), or put a provider load balancer in front (Coolify does not create one). Cookie stickiness stays a Traefik feature; a provider LB needs its own session-affinity setting.
5. Docker Compose apps cannot attach extra servers; the API is Dockerfile-based, so fine.

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | SIGTERM not reaching Node → no drain, hard kill after 30 s | Not an issue in our `node:20-alpine` image (A8, verified for shell and exec CMD). Re-check only if the base image or CMD changes |
| R2 | Upstream names change per deploy → LB 502 after deploy | Network aliases (section 3); verify after the first redeploy of each app |
| R3 | Cookie stickiness may not hold for the mobile HTTP stack (React Native may not persist `Set-Cookie` the way a browser does) → polling requests bounce between instances → "Session ID unknown", reconnect loops | Test on real iOS and Android in phase 4. Fallback if broken: mobile websocket-only transport (listed as a follow-up in #370), or stickiness by source IP (`sticky` is cookie-only in Traefik; use a single-instance route for `/api/socket` as a stopgap) |
| R4 | Real client IP lost → one shared rate-limit bucket | Check `X-Forwarded-For` reaches the API with the client IP; exactly one proxy hop |
| R5 | Both apps deploy simultaneously → no healthy instance briefly | Stagger deploys (section 7) |
| R6 | Redis eviction of lock/limiters under memory pressure | `maxmemory-policy volatile-lru`, 128 MB cap; watch `used_memory` |
| R7 | Redis down | Limiters fail open, adapter local, jobs standby: degraded but alive; alert on Redis resource health |
| R8 | One VPS = still one point of failure (host, Coolify, Redis, proxy) | Two instances protect against a crashed container / deploys, not host failure; see section 9 for the next step |
| R9 | Traefik file edit mistakes break the proxy for **all** apps | Test on a test hostname first; Proxy → Logs shows config errors; the file can be deleted in the UI |
| R10 | Neon connections ×2 | Check pool size (A11); Prisma `connection_limit` |
| R11 | Env drift between app 1 and 2 | Use shared variables, diff both env pages before each phase |
| R12 | Dev and prod sharing Redis | Never; see #373 |

## 11. What we confirmed on the real dev environment

The owner built the dev environment on Coolify; these facts were observed there (or locally with Docker), not taken from docs.

**Coolify layout**
- Two Applications, in two Coolify projects: `production` and `dev`.
- **Dev app** tracks branch `Dev`, source **Public GitHub**, Auto deploy = **Deploy on push (webhooks)**. This needs a GitHub repo webhook: Payload URL `http://<coolify-host>:8000/webhooks/source/github/events/manual`, content type form or json, **push** events, a shared secret that matches the one in Coolify. The first webhook-triggered deploy worked.
- **Production app** tracks `main` and also auto-deploys on every merge to `main`, so every merge goes live. Consider **Watch Paths** on the app to skip docs-only changes (**VERIFY** the syntax in your version).
- **Rolling update** waits for the Docker `HEALTHCHECK` (from #373) and removes the old container only after the new one is healthy.
- Deleting the old container deletes its logs. A drain proof (`[SHUTDOWN] SIGTERM received, draining...` / `[SHUTDOWN] done`) therefore has to come from `docker stop` locally, or from a **Restart** of the same container, not from an old container after a rolling deploy.

**Redis**
- Production Redis is a Coolify-managed Redis resource: Public access = Private, port 6379, internal URL ends in `:6379/0`. Never copy its credentials into docs or other envs.
- The old Render dev server used a separate external Redis. Dev therefore needs **its own** Coolify Redis resource; use that resource's INTERNAL URL, never production's (see section 4).

**Dev env var set that works (names only, no values)**

| Variable | Notes |
|---|---|
| `DATABASE_URL` | pooled Neon host (contains `-pooler`) |
| `DIRECT_DATABASE_URL` | direct host, **same database** as above; the seed refuses to run if they differ |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Clerk test instance, the same one Vercel Preview uses |
| `NODE_ENV` | `production` |
| `PORT` | `3005` |
| `PUBLIC_SERVER_URL` | the dev API's public URL |
| `RUN_BACKGROUND_JOBS` | `false` |
| `ALLOW_DISK_UPLOADS` | `true` (no Cloudinary in dev) |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY` | optional |
| Firebase | not set |
| `REDIS_URL` | unset until a dev Redis resource exists |
| CORS | Vercel Preview origins are allowed by the team-slug regex in `server/utils/corsOrigin.js` (#380). Do **not** set `CORS_PERMISSIVE` |

**Lesson learned: check `DIRECT_DATABASE_URL` before the first deploy.** On the first dev boot a `DIRECT_DATABASE_URL` pointing at production made `prisma migrate deploy` run against the **production** database. Before the first deploy of any environment, remove `-pooler` from the `DATABASE_URL` host and compare it with the `DIRECT_DATABASE_URL` host: they must be identical (and be the environment's own database).

## Open questions only the owner can answer

Things only visible in the Coolify UI or on the VPS; none were checked:

1. Coolify version, and whether the proxy is Traefik or Caddy (A1, A2). If Caddy, section 3 must be redone.
2. Production app's exact build settings (A3) and whether rolling updates currently happen (A7).
3. Whether the Application page in your version offers **Custom Network Aliases**, **Duplicate**, **Shared Variables**, deployment **Rollback**, and Redis custom start command (all marked VERIFY).
4. Stop Grace Period value and VPS RAM/CPU headroom for 2 API containers + Redis.
5. The cert-resolver and entrypoint names in **Proxy → Configuration**, and whether Coolify's generated labels for the production domain can be removed cleanly by clearing the Domain field.
6. Whether mobile releases pin the API URL (`joinup-api.duckdns.org`) — the cutover keeps it unchanged, so no app update is needed.
7. Whether a short maintenance window (seconds) at the phase-4 cutover is acceptable, and when.
8. Whether to accept the mobile stickiness fallback (R3) if real-device tests fail.
9. Neon pooled-connection headroom for a second instance (A11).
10. Whether Redis should be Coolify's default image or Valkey (no documented support).

## Sources

All fetched 2026-10-21.

- Coolify Redis: https://coolify.io/docs/databases/redis
- Coolify rolling updates: https://coolify.io/docs/knowledge-base/rolling-updates
- Coolify health checks: https://coolify.io/docs/knowledge-base/health-checks
- Coolify Traefik overview (default proxy, dynamic config paths): https://coolify.io/docs/knowledge-base/proxy/traefik/overview
- Coolify Traefik load balancing: https://coolify.io/docs/knowledge-base/proxy/traefik/load-balancing
- Coolify scaling overview (multi-server, registry): https://coolify.io/docs/core/infrastructure/scaling/overview
- Coolify servers: https://coolify.io/docs/knowledge-base/server/introduction
- Traefik sticky cookie labels / file config: https://doc.traefik.io/traefik/expose/docker/advanced/
- Code behaviour: PR #370 (`server/index.js`, `services/leaderLock.js`, `lib/redis.js`, `socket/adapter.js`) and PR #373 (`docs/dev-environment.md`, `server/Dockerfile`).
