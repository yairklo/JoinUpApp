#!/usr/bin/env bash
# JoinUp deploy helper. Run ON THE SERVER from a git checkout of the repo.
#
#   deploy/deploy.sh deploy [git-ref]   build <ref> (default: origin/main), migrate, restart, health-check;
#                                       auto-rolls back to the previous version if the new one is unhealthy
#   deploy/deploy.sh rollback [tag]     go back to a previously deployed tag (default: the previous deploy)
#   deploy/deploy.sh status             current/previous/failed tag, containers, health
#   deploy/deploy.sh logs [service]     tail logs
#   deploy/deploy.sh migrate            run `prisma migrate deploy` only
#
# Env knobs: HEALTH_TIMEOUT (s, default 120), KEEP_TAGS (old image tags to keep, default 5),
#            TAKEOVER=1 (first deploy only: stop the old non-JoinUp stack holding ports 80/443, see README).
#
# Rollback swaps CONTAINERS and the compose/Caddy files of the target commit. It never reverts the
# database - read deploy/README.md ("Database migrations and rollback").
set -euo pipefail

# `git checkout` below rewrites this very file, and bash reads scripts incrementally. So the first
# thing we do is re-exec from a private copy; the original file is never read again.
if [ -z "${JOINUP_DEPLOY_COPY:-}" ]; then
  _self="${BASH_SOURCE[0]}"
  _dir="$(cd "$(dirname "$_self")" && pwd)"
  _tmp="$(mktemp)"
  cp "$_self" "$_tmp"
  JOINUP_DEPLOY_COPY=1 JOINUP_DEPLOY_DIR="$_dir" exec bash "$_tmp" "$@"
fi
rm -f "$0" 2>/dev/null || true

DEPLOY_DIR="$JOINUP_DEPLOY_DIR"
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
STATE_DIR="$DEPLOY_DIR/.state"
cd "$DEPLOY_DIR"

die() { echo "!! $*" >&2; exit 1; }
read_state() { if [ -f "$STATE_DIR/$1" ]; then cat "$STATE_DIR/$1"; fi; }
git_() { git -C "$REPO_DIR" "$@"; }

# Compose files are resolved at call time: after a checkout they come from the checked-out commit.
dc() {
  local files=(-f docker-compose.yml)
  if [ -f docker-compose.prod.yml ] && [ "${USE_PROD_OVERRIDE:-1}" = "1" ]; then files+=(-f docker-compose.prod.yml); fi
  docker compose "${files[@]}" "$@"
}

acquire_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$STATE_DIR/lock"
    flock -n 9 || die "another deploy/rollback is running (lock: $STATE_DIR/lock)"
  else
    mkdir "$STATE_DIR/lock.d" 2>/dev/null || die "another deploy/rollback is running (remove $STATE_DIR/lock.d if stale)"
    trap 'rmdir "$STATE_DIR/lock.d" 2>/dev/null || true' EXIT
  fi
}

preflight() {
  [ -f .env ] || die "missing deploy/.env (copy .env.example)"
  [ -f api.env ] || die "missing deploy/api.env (copy api.env.example)"
  mkdir -p "$STATE_DIR"
  local profiles jobs
  profiles="$(grep -E '^COMPOSE_PROFILES=' .env | tail -1 | cut -d= -f2- || true)"
  jobs="$(grep -E '^API_RUN_BACKGROUND_JOBS=' .env | tail -1 | cut -d= -f2- || true)"
  if [[ ",${COMPOSE_PROFILES:-$profiles}," == *",worker,"* ]] && [ "${API_RUN_BACKGROUND_JOBS:-$jobs}" != "false" ]; then
    die "worker profile is enabled but API_RUN_BACKGROUND_JOBS=false is not set in deploy/.env: jobs would run twice"
  fi
}

require_clean_tree() {
  git_ diff --quiet && git_ diff --cached --quiet || die "tracked files in the checkout are modified; commit/stash them (deploys check out other commits)"
}

wait_healthy() {
  # `up --wait` blocks until services with healthchecks are healthy (or fails). --no-build: never build here.
  dc up -d --no-build --remove-orphans --wait --wait-timeout "${HEALTH_TIMEOUT:-120}"
}

ensure_image() {
  local tag="$1"
  if ! docker image inspect "joinup-api:$tag" >/dev/null 2>&1; then
    echo ">> image joinup-api:$tag not present; building it from the (checked out) matching commit"
    IMAGE_TAG="$tag" dc build api
  fi
}

# Check out <tag> (so compose files/Caddyfile match it), make sure its image exists, start it.
switch_to() {
  local tag="$1"
  git_ checkout -q --detach "$tag"
  ensure_image "$tag"
  IMAGE_TAG="$tag" wait_healthy
}

run_migrations() {
  echo ">> prisma migrate deploy (uses DIRECT_DATABASE_URL from api.env)"
  echo "!! NOTE: migrations run BEFORE the containers are swapped. The currently running version keeps"
  echo "!!       serving against the NEW schema until the swap, and after a rollback. A non-additive"
  echo "!!       migration (drop/rename/NOT NULL) can break it. See README 'Database migrations'."
  dc run --rm --no-deps api npx prisma migrate deploy
}

# Containers (not ours) publishing host ports 80/443: the hand-built stack we are replacing.
foreign_web_containers() {
  { docker ps --filter publish=80 --format '{{.Names}}'; docker ps --filter publish=443 --format '{{.Names}}'; } \
    | sort -u | grep -v '^joinup-' || true
}

prune_images() {
  local keep="${KEEP_TAGS:-5}" cur prev tags t n=0
  cur="$(read_state current)"; prev="$(read_state previous)"
  tags="$(docker image ls joinup-api --format '{{.Tag}}' 2>/dev/null || true)" # newest first
  for t in $tags; do
    n=$((n + 1))
    if [ "$t" = "$cur" ] || [ "$t" = "$prev" ] || [ "$n" -le "$keep" ]; then continue; fi
    docker rmi "joinup-api:$t" >/dev/null 2>&1 || true
  done
  docker image prune -f >/dev/null 2>&1 || true
}

cmd_deploy() {
  local ref="${1:-origin/main}" sha prev first=0 foreign
  preflight; acquire_lock; require_clean_tree
  git_ fetch --prune origin
  sha="$(git_ rev-parse --short=12 "$ref")"
  prev="$(read_state current)"
  [ -n "$prev" ] || first=1
  echo ">> deploying $ref ($sha); previous: ${prev:-none}"

  foreign="$(foreign_web_containers)"
  if [ "$first" = 1 ] && [ -n "$foreign" ] && [ "${TAKEOVER:-0}" != "1" ]; then
    die "ports 80/443 are held by other containers: $(echo $foreign). First deploy replaces them: re-run with TAKEOVER=1 (they are stopped, not removed, and restarted if this deploy fails). See README 'Cutover'."
  fi

  git_ checkout -q --detach "$sha"
  export IMAGE_TAG="$sha"
  dc build api
  run_migrations

  if [ "$first" = 1 ] && [ -n "$foreign" ]; then
    echo ">> TAKEOVER: stopping old containers: $(echo $foreign)"
    echo "$foreign" > "$STATE_DIR/old_containers"
    # shellcheck disable=SC2086
    docker stop $foreign >/dev/null
  fi

  if wait_healthy; then
    if [ -n "$prev" ] && [ "$prev" != "$sha" ]; then echo "$prev" > "$STATE_DIR/previous"; fi
    echo "$sha" > "$STATE_DIR/current"
    echo ">> OK: $sha is live"
    [ ! -s "$STATE_DIR/old_containers" ] || echo ">> old containers remain stopped (not removed): $(tr '\n' ' ' < "$STATE_DIR/old_containers")"
    prune_images
    return 0
  fi

  echo "!! $sha did not become healthy"
  echo "$sha" > "$STATE_DIR/failed"
  if [ -n "$prev" ]; then
    echo "!! rolling back to $prev (database NOT reverted; migrations of $sha stay applied)"
    switch_to "$prev" || echo "!! previous version also unhealthy - see: deploy.sh logs"
  elif [ -s "$STATE_DIR/old_containers" ]; then
    echo "!! first deploy failed: stopping the new stack and restarting the old containers"
    dc down || true
    # shellcheck disable=SC2046
    docker start $(cat "$STATE_DIR/old_containers") || echo "!! could not restart old containers: start them by hand (names in $STATE_DIR/old_containers)"
  else
    echo "!! first deploy failed and there is no previous version. The site is DOWN. Inspect: deploy.sh logs;"
    echo "!! if an old stack existed, start it again (docker start <old containers>) after 'docker compose down' here."
  fi
  return 1
}

cmd_rollback() {
  local tag="${1:-$(read_state previous)}" cur
  preflight; acquire_lock; require_clean_tree
  [ -n "$tag" ] || die "no previous tag recorded; pass one: deploy.sh rollback <tag>"
  cur="$(read_state current)"
  echo ">> rolling back $cur -> $tag (database is NOT reverted)"
  switch_to "$tag"
  echo "$tag" > "$STATE_DIR/current"
  if [ -n "$cur" ] && [ "$cur" != "$tag" ]; then echo "$cur" > "$STATE_DIR/previous"; fi
  echo ">> OK: $tag is live"
}

cmd_status() {
  echo "current : $(read_state current)"
  echo "previous: $(read_state previous)"
  echo "failed  : $(read_state failed)"
  IMAGE_TAG="$(read_state current)" dc ps
  if IMAGE_TAG="$(read_state current)" dc exec -T api curl -fsS http://127.0.0.1:3005/api/health; then echo; else echo "health: unreachable"; fi
}

main() {
  case "${1:-}" in
    deploy)   shift; cmd_deploy "$@" ;;
    rollback) shift; cmd_rollback "$@" ;;
    status)   mkdir -p "$STATE_DIR"; cmd_status ;;
    logs)     shift; IMAGE_TAG="$(read_state current)" dc logs -f --tail=200 "$@" ;;
    migrate)  preflight; acquire_lock; IMAGE_TAG="$(read_state current)" run_migrations ;;
    *) sed -n '2,15p' "$DEPLOY_DIR/deploy.sh"; return 1 ;;
  esac
}
main "$@"; exit $?
