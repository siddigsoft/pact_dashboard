#!/usr/bin/env bash
# Backup Supabase schema only (includes tables, FKs, constraints, extensions, indexes, and RLS policies)
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup_supabase_schema.sh
#   or
#   ./scripts/backup_supabase_schema.sh "postgresql://user:pass@host:5432/dbname"

set -euo pipefail

print_usage() {
  cat <<EOF
Usage: $0 [DATABASE_URL] [OUT_DIR]

Exports a schema-only dump from the provided PostgreSQL connection string and gzips it.
If DATABASE_URL is not provided as the first argument, the script looks for the DATABASE_URL environment variable.
OUT_DIR defaults to current directory.

Important: keep your connection string secret. Do NOT commit it to version control.
EOF
}

if [[ "${1-}" == "-h" || "${1-}" == "--help" ]]; then
  print_usage
  exit 0
fi

# Read connection string from argument or env
if [[ -n "${1-}" && "$1" =~ ^postgres ]]; then
  DATABASE_URL="$1"
elif [[ -n "${DATABASE_URL-}" ]]; then
  DATABASE_URL="$DATABASE_URL"
else
  echo "Error: No DATABASE_URL provided. Provide as first arg or set DATABASE_URL environment variable." >&2
  print_usage
  exit 2
fi

OUT_DIR="${2-.}"
mkdir -p "$OUT_DIR"

TS=$(date +%Y%m%d_%H%M%S)
OUT_FILE="$OUT_DIR/supabase_schema_${TS}.sql"
OUT_FILE_GZ="$OUT_FILE.gz"

# Ensure pg_dump is available
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump not found. Install it (e.g. with brew install postgresql) and try again." >&2
  exit 3
fi

# Run pg_dump: schema-only, include drop statements (--clean), do not include ownership or ACLs
# This dump will include: CREATE TABLE, constraints, foreign keys, indexes, extensions, functions, triggers, and CREATE POLICY statements (RLS)
# We use plain text output for easy review and restoration with psql.

echo "Exporting schema to $OUT_FILE (this may take a moment)"

PGPASSWORD="" \
PGOPTIONS="" \
pg_dump \
  --dbname="$DATABASE_URL" \
  --schema-only \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --file="$OUT_FILE"

# gzip the result
gzip -f "$OUT_FILE"

if [[ $? -eq 0 ]]; then
  echo "Schema exported and gzipped to: $OUT_FILE_GZ"
  exit 0
else
  echo "pg_dump failed" >&2
  exit 4
fi
