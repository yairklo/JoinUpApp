#!/usr/bin/env bash
# Build deploy/api.env from a RUNNING or STOPPED old API container, copying ONLY the variables named in
# api.env.example (never PATH, HOME, NODE_VERSION, ... and never anything compose sets itself).
#
#   deploy/import-env.sh <old-container-name>
#
# - refuses to overwrite an existing api.env
# - writes each value single-quoted (Compose does no `$` interpolation inside single quotes)
# - never prints values; reports only names: copied / missing / needs manual review
# - a value containing a single quote or a newline is NOT copied: set it by hand (reported)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
container="${1:?usage: import-env.sh <old-container-name>}"
[ ! -e api.env ] || { echo "api.env already exists; refusing to overwrite" >&2; exit 1; }

names="$(grep -oE '^#? ?[A-Z][A-Z0-9_]*=' api.env.example | tr -d '# =' | sort -u)"
dump="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container")"

umask 077
out="$(mktemp)"
copied=(); missing=(); review=()
for n in $names; do
  # first line of the dump that starts with NAME=
  line="$(printf '%s\n' "$dump" | grep -m1 -E "^${n}=" || true)"
  if [ -z "$line" ]; then missing+=("$n"); continue; fi
  val="${line#*=}"
  # Continuation lines of a multi-line value would not look like NAME=...; detect by counting
  # the lines that follow until the next KEY= line.
  extra="$(printf '%s\n' "$dump" | awk -v k="$n=" 'index($0,k)==1{f=1;next} f&&/^[A-Za-z_][A-Za-z0-9_]*=/{exit} f&&NF{c++} END{print c+0}')"
  if [ "$extra" != "0" ] || [[ "$val" == *"'"* ]]; then review+=("$n"); continue; fi
  [ -n "$val" ] || { missing+=("$n"); continue; }
  printf "%s='%s'\n" "$n" "$val" >> "$out"
  copied+=("$n")
done
mv "$out" api.env; chmod 600 api.env
echo "copied (${#copied[@]}): ${copied[*]:-none}"
echo "not in container / empty (${#missing[@]}): ${missing[*]:-none}"
echo "NEEDS MANUAL REVIEW (multi-line or contains a single quote) (${#review[@]}): ${review[*]:-none}"
echo "Next: compare with api.env.example, fill the missing ones you need, then 'docker compose config -q'."
