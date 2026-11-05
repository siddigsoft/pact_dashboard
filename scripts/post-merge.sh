#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "Post-merge setup requires package.json and package-lock.json." >&2
  exit 1
fi

inputs=(package.json package-lock.json)
[[ ! -f .npmrc ]] || inputs+=(.npmrc)
fingerprint="$(sha256sum "${inputs[@]}" | sha256sum | cut -d ' ' -f 1)"
stamp="node_modules/.pact-post-merge-dependencies"

if [[ -x node_modules/.bin/vite && -f "$stamp" && "$(cat "$stamp")" == "$fingerprint" ]]; then
  echo "Post-merge: locked dependencies already synchronized."
else
  echo "Post-merge: synchronizing dependencies and reconciling the lockfile."
  # Task merges can introduce missing transitive lock entries. Unlike npm ci,
  # npm install reconciles those entries while keeping compatible locked versions.
  npm install --prefer-offline --no-audit --no-fund
  if [[ ! -x node_modules/.bin/vite ]]; then
    echo "Dependency setup completed without the required Vite executable." >&2
    exit 1
  fi
  fingerprint="$(sha256sum "${inputs[@]}" | sha256sum | cut -d ' ' -f 1)"
  printf '%s\n' "$fingerprint" > "$stamp"
fi

# Vite serves source directly; managed workflow reconciliation handles restart.
# Production builds/publishing and Supabase SQL/function deployment are separate
# user-controlled steps. Never run those against live services during a merge.
echo "Post-merge setup complete. Supabase migrations and function deployment remain manual."
