#!/usr/bin/env bash
# JoinUp deploy helper. Run ON THE SERVER from a git checkout of the repo.
#
#   deploy/deploy.sh deploy [git-ref]   build <ref> (default: origin/main), migrate, restart, health-check;
#                                       auto-rolls back the containers if the new version is unhealthy
#   deploy/deploy.sh rollback [tag]     restart a previously built image tag (default: the previous deploy)
#   deploy/deploy.sh status             show current/previous tag, containers, health
#   deploy/deploy.sh logs [service]     tail logs
#   deploy/deploy.sh migrate            run `prisma migrate deploy` only
#
# Rollback only swaps CONTAINER images. It never reverts the database - read deploy/README.md
# ("Database migrations and rollback") before rolling back past a migration.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
STATE_DIR="$DEPLOY_DIR/.state"
cd "$DEPLOY_DIR"

[ -f .env ] || { echo "missing deploy/.env (copy .env.example)"; exit 1; }
[ -f api.env ] || { echo "missing deploy/api.env (copy api.env.example)"; exit 1; }
mkdir -p "$STATE_DIR"

COMPOSE_FILES=(-f docker-compose.yml)
[ -f docker-compose.prod.yml ] && [ "${USE_PROD_OVERRIDE:-1}" = "1" ] && COMPOSE_FILES+=(-f docker-compose.prod.yml)
dc() { docker compose "${COMPOSE_FILES[@]}" "$@"; }

read_state() { [ -f "$STATE_DIR/$1" ] && cat "$STATE_DIR/$1" || true; }

# web.env is only required when the web profile is enabled; compose needs the file to exist.
if [[ ",${COMPOSE_PROFILES:-$(grep -E '^COMPOSE_PROFILES=' .env | cut -d= -f2-)}," == *",web,"* ]] && [ ! -f web.env ]; then
  echo "web profile enabled but deploy/web.env is missing"; exit 1
fi

wait_healthy() {
  # `up --wait` blocks until services with healthchecks are healthy (or fails).
  dc up -d --remove-orphans --wait --wait-timeout "${HEALTH_TIMEOUT:-120}"
}

run_migrations() {
  echo ">> prisma migrate deploy (uses DIRECT_DATABASE_URL from api.env)"
  dc run --rm --no-deps api npx prisma migrate deploy
}

cmd_deploy() {
  local ref="${1:-origin/main}" sha prev
  git -C "$REPO_DIR" fetch --prune origin
  sha="$(git -C "$REPO_DIR" rev-parse --short=12 "$ref")"
  prev="$(read_state current)"
  echo ">> deploying $ref ($sha); previous: ${prev:-none}"
  git -C "$REPO_DIR" checkout --detach "$sha"

  export IMAGE_TAG="$sha"
  dc build
  run_migrations

  if wait_healthy; then
    [ -n "$prev" ] && [ "$prev" != "$sha" ] && echo "$prev" > "$STATE_DIR/previous"
    echo "$sha" > "$STATE_DIR/current"
    echo ">> OK: $sha is live"
  else
    echo "!! $sha did not become healthy"
    echo "$sha" > "$STATE_DIR/failed"
    if [ -n "$prev" ]; then
      echo "!! rolling containers back to $prev (database NOT reverted)"
      IMAGE_TAG="$prev" wait_healthy || echo "!! previous version also unhealthy - see: deploy.sh logs"
    fi
    exit 1
  fi
  docker image prune -f >/dev/null
}

cmd_rollback() {
  local tag="${1:-$(read_state previous)}" cur
  [ -n "$tag" ] || { echo "no previous tag recorded; pass one: deploy.sh rollback <tag>"; exit 1; }
  cur="$(read_state current)"
  if ! docker image inspect "joinup-api:$tag" >/dev/null 2>&1; then
    echo ">> image joinup-api:$tag not present locally, rebuilding from git"
    git -C "$REPO_DIR" checkout --detach "$tag"
    IMAGE_TAG="$tag" dc build
  fi
  echo ">> rolling back $cur -> $tag (database is NOT reverted)"
  IMAGE_TAG="$tag" wait_healthy
  echo "$tag" > "$STATE_DIR/current"
  [ -n "$cur" ] && echo "$cur" > "$STATE_DIR/previous"
  echo ">> OK: $tag is live"
}

cmd_status() {
  echo "current : $(read_state current)"
  echo "previous: $(read_state previous)"
  echo "failed  : $(read_state failed)"
  IMAGE_TAG="$(read_state current)" dc ps
  docker run --rm --network joinup_default curlimages/curl -fsS http://api:3005/api/health 2>/dev/null && echo || echo "health: unreachable"
}

main() {
case "${1:-}" in
  deploy)   shift; cmd_deploy "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  status)   cmd_status ;;
  logs)     shift; IMAGE_TAG="$(read_state current)" dc logs -f --tail=200 "$@" ;;
  migrate)  IMAGE_TAG="$(read_state current)" run_migrations ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac
}
# `exit` stops bash reading the file again: `git checkout` inside deploy rewrites this very script.
main "$@"
exit $?
