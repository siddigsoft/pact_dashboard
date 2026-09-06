#!/usr/bin/env bash
set -euo pipefail

# Disposable live PostgreSQL harness. No Supabase or project data is touched.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb)")"
TMP_DIR="$(mktemp -d)"
PORT="${FIELD_DEVICE_TEST_PORT:-55461}"
SOCKET_DIR="$TMP_DIR/socket"
PSQL=("$PG_BIN/psql" -X -h "$SOCKET_DIR" -p "$PORT" -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1)

cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "Field-device attribution/Cycle Close regression suite failed (exit $status)." >&2
    for log in "$TMP_DIR"/*.log; do
      [[ -f "$log" ]] || continue
      echo "::group::$(basename "$log")" >&2
      cat "$log" >&2
      echo "::endgroup::" >&2
    done
  fi
  "$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$SOCKET_DIR"
"$PG_BIN/initdb" -D "$TMP_DIR/data" --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -o "-k $SOCKET_DIR -p $PORT" -w start >/dev/null

(
  cd "$ROOT/supabase/tests"
  "${PSQL[@]}" -f field_device_cycle_close_attribution_test.sql
)

MANAGER="00000000-0000-0000-0000-000000000001"
COLLECTOR_B="00000000-0000-0000-0000-000000000003"
DEVICE_1="$("${PSQL[@]}" -Atc "SELECT id FROM field_devices WHERE odk_source_key_normalized='odkdevice01'")"

# Ordering 1: correction owns the parent-cycle lock first. Final Close waits,
# then snapshots the corrected official collector.
"${PSQL[@]}" >"$TMP_DIR/correction-first.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$MANAGER',false);
SELECT 1 FROM mmp_files WHERE id='10000000-0000-0000-0000-000000000002' FOR UPDATE;
\! touch "$TMP_DIR/correction.locked"
SELECT pg_sleep(1);
SELECT public.correct_collection_attribution(
 '20000000-0000-0000-0000-000000000007','$DEVICE_1','$COLLECTOR_B',NULL,
 'Concurrent correction committed before close'
);
COMMIT;
SQL
CORRECTION_PID=$!
for _ in {1..100}; do [[ -f "$TMP_DIR/correction.locked" ]] && break; sleep 0.02; done
[[ -f "$TMP_DIR/correction.locked" ]] || { echo "Correction lock barrier timed out" >&2; exit 1; }
"${PSQL[@]}" >"$TMP_DIR/close-after-correction.log" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub','$MANAGER',false);
SELECT public.close_mmp_and_lock_incentives('10000000-0000-0000-0000-000000000002',NULL);
SQL
CLOSE_PID=$!
wait "$CORRECTION_PID"
wait "$CLOSE_PID"

"${PSQL[@]}" <<'SQL'
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE v_live uuid; v_snap uuid; v_report uuid;
BEGIN
 SELECT attribution_collector_id INTO v_live FROM mmp_site_entries
  WHERE id='20000000-0000-0000-0000-000000000007';
 SELECT (r->>'collector_id')::uuid INTO v_snap
  FROM cycle_close_attribution_snapshots s,
       LATERAL jsonb_array_elements(s.attribution_state) r
  WHERE s.mmp_id='10000000-0000-0000-0000-000000000002'
    AND r->>'site_id'='20000000-0000-0000-0000-000000000007';
 SELECT (r->>'resolved_collector_id')::uuid INTO v_report
  FROM jsonb_array_elements(public.get_cycle_attribution_report(
   '10000000-0000-0000-0000-000000000002')->'rows') r;
 IF v_live<>'00000000-0000-0000-0000-000000000003' OR v_snap<>v_live OR v_report<>v_live THEN
  RAISE EXCEPTION 'correction-first ordering diverged: live %, snapshot %, report %',v_live,v_snap,v_report;
 END IF;
END $$;
SQL

# Ordering 2: Final Close owns the lock first. The correction waits and then
# must reject, leaving live Finance identity equal to the immutable snapshot.
"${PSQL[@]}" >"$TMP_DIR/close-first.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$MANAGER',false);
SELECT 1 FROM mmp_files WHERE id='10000000-0000-0000-0000-000000000003' FOR UPDATE;
\! touch "$TMP_DIR/close.locked"
SELECT pg_sleep(1);
SELECT public.close_mmp_and_lock_incentives('10000000-0000-0000-0000-000000000003',NULL);
COMMIT;
SQL
CLOSE_PID=$!
for _ in {1..100}; do [[ -f "$TMP_DIR/close.locked" ]] && break; sleep 0.02; done
[[ -f "$TMP_DIR/close.locked" ]] || { echo "Close lock barrier timed out" >&2; exit 1; }
set +e
"${PSQL[@]}" >"$TMP_DIR/correction-after-close.log" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub','$MANAGER',false);
SELECT public.correct_collection_attribution(
 '20000000-0000-0000-0000-000000000008','$DEVICE_1','$COLLECTOR_B',NULL,
 'Concurrent correction attempted after close'
);
SQL
CORRECTION_PID=$!
wait "$CLOSE_PID"
wait "$CORRECTION_PID"
CORRECTION_STATUS=$?
set -e
if [[ "$CORRECTION_STATUS" -eq 0 ]] || ! grep -q 'CYCLE_CLOSED' "$TMP_DIR/correction-after-close.log"; then
  cat "$TMP_DIR/correction-after-close.log" >&2
  echo "Expected close-first correction to fail with CYCLE_CLOSED" >&2
  exit 1
fi

"${PSQL[@]}" <<'SQL'
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE v_live uuid; v_snap uuid; v_report jsonb; v_report_id uuid; v_report_name text;
BEGIN
 SELECT attribution_collector_id INTO v_live FROM mmp_site_entries
  WHERE id='20000000-0000-0000-0000-000000000008';
 SELECT (r->>'collector_id')::uuid INTO v_snap
  FROM cycle_close_attribution_snapshots s,
       LATERAL jsonb_array_elements(s.attribution_state) r
  WHERE s.mmp_id='10000000-0000-0000-0000-000000000003'
    AND r->>'site_id'='20000000-0000-0000-0000-000000000008';
 v_report:=public.get_cycle_attribution_report('10000000-0000-0000-0000-000000000003');
 SELECT (r->>'resolved_collector_id')::uuid,r->>'resolved_collector_name'
  INTO v_report_id,v_report_name FROM jsonb_array_elements(v_report->'rows') r;
 IF v_live<>'00000000-0000-0000-0000-000000000002' OR v_snap<>v_live
    OR v_report_id<>v_live OR v_report_name<>'Official Collector A' THEN
  RAISE EXCEPTION 'close-first ordering diverged: live %, snapshot %, report % (%)',
   v_live,v_snap,v_report_id,v_report_name;
 END IF;
END $$;
SQL

echo "Field-device attribution and concurrent Cycle Close checks passed."