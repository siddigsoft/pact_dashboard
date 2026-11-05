#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb)")"
TMP_DIR="$(mktemp -d)"
PORT="${SCANNER_HISTORY_TEST_PORT:-55468}"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
mkdir -p "$TMP_DIR/socket"
"$PG_BIN/initdb" -D "$TMP_DIR/data" --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -o "-k $TMP_DIR/socket -p $PORT" -w start >/dev/null
"$PG_BIN/psql" -X -h "$TMP_DIR/socket" -p "$PORT" -U "$(id -un)" -d postgres \
  -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/scanner_historical_duplicates_test.sql"
