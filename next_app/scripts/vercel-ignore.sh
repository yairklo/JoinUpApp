#!/bin/sh
# Vercel "Ignored Build Step": exit 0 = skip the build, exit 1 = build.
# Fail-safe: skip ONLY when git positively confirms nothing under next_app/ or shared/ changed.
# A missing previous SHA, an unreachable commit (shallow clone), or any git failure => build.
# Deliberately no `git fetch`: the Vercel clone has no usable `origin` remote.

if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then
  echo "vercel-ignore: VERCEL_GIT_PREVIOUS_SHA unset - building"
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)" || { echo "vercel-ignore: not a git repo - building"; exit 1; }
cd "$ROOT" || exit 1

git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null || {
  echo "vercel-ignore: previous SHA not in clone - building"
  exit 1
}

git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- next_app shared
case $? in
  0) echo "vercel-ignore: no web changes - skipping build"; exit 0 ;;
  1) echo "vercel-ignore: web files changed - building"; exit 1 ;;
  *) echo "vercel-ignore: git diff failed - building"; exit 1 ;;
esac
