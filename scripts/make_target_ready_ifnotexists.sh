#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/make_target_ready_ifnotexists.sh
# Reads:  scripts/target_ready.sql
# Writes:  scripts/target_ready_ifnotexists.sql
# The script is conservative: it only replaces CREATE TABLE <schema>.<name>
# with CREATE TABLE IF NOT EXISTS <schema>.<name>. It leaves other DDL alone.

SRC="$(dirname "$0")/target_ready.sql"
DST="$(dirname "$0")/target_ready_ifnotexists.sql"

if [ ! -f "$SRC" ]; then
  echo "ERROR: source file not found: $SRC"
  exit 2
fi

echo "Generating $DST from $SRC ..."

# Replace occurrences of: CREATE TABLE public.foo  -> CREATE TABLE IF NOT EXISTS public.foo
# Use perl for safer in-place style regex handling across multiple forms.
perl -0777 -pe \
  "s/CREATE\s+TABLE\s+([`\"]?\w+[`\"]?\.)?([A-Za-z0-9_]+)/CREATE TABLE IF NOT EXISTS \1\2/ig" \
  "$SRC" > "$DST"

echo "Wrote $DST"
echo "Preview top of generated file:"
sed -n '1,120p' "$DST" || true

echo "Done. Run: psql -v ON_ERROR_STOP=1 -f $DST to import the non-destructive version."

exit 0
