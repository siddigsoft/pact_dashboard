#!/usr/bin/env bash
set -euo pipefail
# import_auth.sh
# Usage: ./scripts/import_auth.sh <TARGET_HOST> <TARGET_DB> <TARGET_USER> <AUTH_SQL_FILE>

if [ "$#" -ne 4 ]; then
  echo "Usage: $0 <TARGET_HOST> <TARGET_DB> <TARGET_USER> <AUTH_SQL_FILE>"
  exit 2
fi

TARGET_HOST=$1
TARGET_DB=$2
TARGET_USER=$3
AUTH_SQL_FILE=$4

if [ ! -f "$AUTH_SQL_FILE" ]; then
  echo "Auth SQL file not found: $AUTH_SQL_FILE"
  exit 3
fi

echo "About to import $AUTH_SQL_FILE into $TARGET_HOST/$TARGET_DB as $TARGET_USER"
echo "This will run the SQL inside a single transaction."

# Use PGPASSWORD env var or prompt
psql -h "$TARGET_HOST" -U "$TARGET_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -f "$AUTH_SQL_FILE"

echo "Import complete."
