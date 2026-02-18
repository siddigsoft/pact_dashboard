#!/usr/bin/env zsh
# scripts/supabase_migrate.sh
# Usage:
#   SOURCE_DB_URL="postgresql://postgres:PASS@host:5432/postgres" \
#   TARGET_DB_URL="postgresql://postgres:PASS@host:5432/postgres" \
#   ./scripts/supabase_migrate.sh full
# or for auth-only:
#   SOURCE_DB_URL=... TARGET_DB_URL=... ./scripts/supabase_migrate.sh auth [extra_table1 extra_table2]

set -euo pipefail
MODE=${1:-full}
shift || true
EXTRA_TABLES=($@)

if [[ -z "${SOURCE_DB_URL:-}" || -z "${TARGET_DB_URL:-}" ]]; then
  echo "Error: SOURCE_DB_URL and TARGET_DB_URL must be set as environment variables."
  echo "See script header for examples."
  exit 1
fi

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump not found. Install PostgreSQL client tools (brew install postgresql)"; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore not found. Install PostgreSQL client tools (brew install postgresql)"; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "psql not found. Install PostgreSQL client tools (brew install postgresql)"; exit 1; }

TMPDIR=$(mktemp -d -t supabase_migrate)
echo "Using temp dir: $TMPDIR"

if [[ "$MODE" = "full" ]]; then
  DUMP_FILE="$TMPDIR/supabase_full.dump"
  echo "Dumping full database from source..."
  pg_dump --format=custom --no-owner --no-acl --dbname="$SOURCE_DB_URL" --file="$DUMP_FILE"

  echo "Creating common extensions on target (pgcrypto, citext) if missing..."
  psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
SQL

  echo "Restoring dump into target..."
  pg_restore --verbose --no-owner --no-acl --dbname="$TARGET_DB_URL" "$DUMP_FILE"

elif [[ "$MODE" = "auth" ]]; then
  DUMP_FILE="$TMPDIR/supabase_auth.dump"
  echo "Dumping auth schema from source..."
  # Dump auth schema
  pg_dump --format=custom --no-owner --no-acl --schema=auth --dbname="$SOURCE_DB_URL" --file="$DUMP_FILE"

  # If extra tables specified, append them to the dump
  if [[ ${#EXTRA_TABLES[@]} -gt 0 ]]; then
    echo "Also dumping extra tables: ${EXTRA_TABLES[*]}"
    for t in "${EXTRA_TABLES[@]}"; do
      EXTRA_FILE="$TMPDIR/extra_$(echo $t | tr '/' '_' | tr '.' '_').dump"
      pg_dump --format=custom --no-owner --no-acl --table="$t" --dbname="$SOURCE_DB_URL" --file="$EXTRA_FILE"
      # merge by restoring extras directly to target after creating extensions
      echo "$EXTRA_FILE" >> "$TMPDIR/restore_list.txt"
    done
  fi

  echo "Creating common extensions on target (pgcrypto, citext) if missing..."
  psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
SQL

  echo "Restoring auth dump into target..."
  pg_restore --verbose --no-owner --no-acl --dbname="$TARGET_DB_URL" "$DUMP_FILE"

  if [[ -f "$TMPDIR/restore_list.txt" ]]; then
    while read -r f; do
      echo "Restoring extra dump $f"
      pg_restore --verbose --no-owner --no-acl --dbname="$TARGET_DB_URL" "$f"
    done < "$TMPDIR/restore_list.txt"
  fi
else
  echo "Unknown mode: $MODE. Use 'full' or 'auth'."
  exit 1
fi

# Fix sequences: generate setval statements and execute on target
echo "Adjusting sequences on target to match max(id) values..."
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -t -A <<'SQL' | psql "$TARGET_DB_URL"
WITH seqs AS (
  SELECT
    quote_ident(nspname) AS schemaname,
    quote_ident(relname) AS seqname,
    quote_ident(tab.relname) AS tablename,
    quote_ident(att.attname) AS colname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'
  JOIN pg_class tab ON d.refobjid = tab.oid
  JOIN pg_attribute att ON att.attrelid = tab.oid AND att.attnum = d.refobjsubid
  WHERE c.relkind = 'S'
)
SELECT 'SELECT setval(''' || schemaname || '.' || seqname || ''',' || 'coalesce(max(' || colname || '),0), true) FROM ' || schemaname || '.' || tablename || ';'
FROM seqs;
SQL

# Simple verification counts
echo "Verifying counts (source -> target):"
psql "$SOURCE_DB_URL" -c "SELECT 'auth.users', count(*) FROM auth.users;" || echo "(source auth.users missing or query failed)"
psql "$TARGET_DB_URL" -c "SELECT 'auth.users', count(*) FROM auth.users;" || echo "(target auth.users missing or query failed)"

# Final reminders
cat <<'EOF'

DONE.
Next manual steps you must perform:
 - In the Supabase dashboard for the target project, copy Auth settings: external providers, SMTP configuration, JWT secrets if you want token compatibility, email templates, and any environment settings.
 - Review Row-Level Security policies and enable them after confirming app functionality.
 - Test logging in as a real user. If tokens fail you may need to rotate or clear refresh tokens.
 - Rotate any secrets you don't want duplicated.

Notes:
 - This script preserves password hashes in auth.users; users should be able to log in with the same passwords in the target project in most cases.
 - Project-level provider secrets (GitHub OAuth client id/secret, SMTP password) are not stored here and must be configured in the target project's Dashboard.
 - If you have very large tables (logs, storage metadata), consider dumping/excluding them to speed up migration.

Security reminder: Do NOT paste your real connection strings into public chat. Run this script locally.

EOF

# Clean up temp files
# (commented out by default so you can inspect files; uncomment to remove)
# rm -rf "$TMPDIR"

echo "Script finished. Temp files are in: $TMPDIR"