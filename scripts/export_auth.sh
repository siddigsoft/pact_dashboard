#!/usr/bin/env bash
set -euo pipefail
# export_auth.sh
# Usage: ./scripts/export_auth.sh <SRC_HOST> <SRC_DB> <SRC_USER> <OUT_FILE>
# The script will prompt for SRC password via PGPASSWORD env or read from prompt.

if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <SRC_HOST> <SRC_DB> <SRC_USER> <OUT_FILE>"
  exit 2
fi

SRC_HOST=$1
SRC_DB=$2
SRC_USER=$3
OUT_FILE=$4

TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT

echo "Dumping auth schema data from $SRC_HOST/$SRC_DB ..."

# pg_dump will use PGPASSWORD env if set; prompt if not.
echo "Running pg_dump (data-only, inserts)..."
PG_DUMP_CMD=(pg_dump --host="$SRC_HOST" --username="$SRC_USER" --dbname="$SRC_DB" \
  --schema=auth --data-only --inserts --no-owner --no-acl)

# Run pg_dump, write to a temp file
"${PG_DUMP_CMD[@]}" > "$TMPD/auth_dump.sql"

echo "Splitting INSERTs by table..."

awk '
  BEGIN{IGNORECASE=1}
  /^INSERT INTO[[:space:]]+auth\./ {
    if (match($0, /INSERT INTO[[:space:]]+auth\."?([a-z0-9_]+)"?/, m)) {
      tbl=tolower(m[1]);
      fname=sprintf("%s/%s.sql", ENVIRON["TMPD"], tbl);
      print $0 >> fname;
    }
    next;
  }
  { print $0 > (ENVIRON["TMPD"] "/other.sql") }
' TMPD="$TMPD" "$TMPD/auth_dump.sql"

echo "Building ordered auth SQL into $OUT_FILE"
{
  echo "SET client_min_messages = WARNING;"
  echo "BEGIN;"
  # preferred order: users, identities, refresh_tokens, then any other auth tables
  for t in users identities refresh_tokens; do
    if [ -f "$TMPD/${t}.sql" ]; then
      cat "$TMPD/${t}.sql"
      echo
    fi
  done
  # append other auth table inserts
  for f in "$TMPD"/*.sql; do
    bn=$(basename "$f")
    case "$bn" in
      users.sql|identities.sql|refresh_tokens.sql|other.sql) ;;
      *) cat "$f"; echo ;;
    esac
  done
  # any other lines captured in other.sql
  if [ -f "$TMPD/other.sql" ]; then
    cat "$TMPD/other.sql"
  fi
  echo "COMMIT;"
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"

exit 0
