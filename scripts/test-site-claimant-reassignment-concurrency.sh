#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(dirname "$(command -v initdb)")"
TMP_DIR="$(mktemp -d)"
PORT="${CLAIMANT_REASSIGNMENT_TEST_PORT:-55467}"
SOCKET_DIR="$TMP_DIR/socket"
PSQL=("$PG_BIN/psql" -X -h "$SOCKET_DIR" -p "$PORT" -U "$(id -un)" -d postgres -v ON_ERROR_STOP=1)
cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    for log in "$TMP_DIR"/*.log; do [[ -f "$log" ]] && { echo "== $(basename "$log") ==" >&2; cat "$log" >&2; }; done
  fi
  "$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT
mkdir -p "$SOCKET_DIR"
"$PG_BIN/initdb" -D "$TMP_DIR/data" --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TMP_DIR/data" -o "-k $SOCKET_DIR -p $PORT" -w start >/dev/null
(cd "$ROOT/supabase/tests" && "${PSQL[@]}" -f site_claimant_reassignment_concurrency_test.sql)

ADMIN="00000000-0000-0000-0000-000000000001"
A="00000000-0000-0000-0000-00000000000a"
B="00000000-0000-0000-0000-00000000000b"
SITE="10000000-0000-0000-0000-000000000006"
"${PSQL[@]}" -c "INSERT INTO mmp_site_entries(id,accepted_by,status) VALUES ('$SITE','$A','completed');"

# Reassignment commits first; stale settlement waits and then fails closed.
"${PSQL[@]}" >"$TMP_DIR/reassign-first.log" 2>&1 <<SQL &
BEGIN;
SELECT set_config('request.jwt.claim.sub','$ADMIN',false);
SELECT pg_advisory_xact_lock(hashtextextended('site_claimant_reassignment:$SITE',0));
SELECT reassign_site_claimant_rpc('$SITE','$B','Concurrent reassignment wins','race-reassign-first');
\! touch "$TMP_DIR/reassigned"
SELECT pg_sleep(1);
COMMIT;
SQL
P1=$!
for _ in {1..100}; do [[ -f "$TMP_DIR/reassigned" ]] && break; sleep .02; done
[[ -f "$TMP_DIR/reassigned" ]]
set +e
"${PSQL[@]}" >"$TMP_DIR/stale-settlement.log" 2>&1 -c "
UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id='$SITE';"
STALE_RC=$?
set -e
wait "$P1"
if [[ "$STALE_RC" -eq 0 ]] || ! grep -q 'CLAIMANT_SETTLEMENT_MISMATCH' "$TMP_DIR/stale-settlement.log"; then
  echo "stale concurrent settlement did not fail closed" >&2; exit 1
fi

# Settlement commits first; reassignment waits, observes it, and moves it once.
SITE2="10000000-0000-0000-0000-000000000007"
"${PSQL[@]}" -c "INSERT INTO mmp_site_entries(id,accepted_by,status) VALUES ('$SITE2','$A','completed');"
"${PSQL[@]}" >"$TMP_DIR/settle-first.log" 2>&1 <<SQL &
BEGIN;
UPDATE mmp_site_entries SET status='wfp_confirmed' WHERE id='$SITE2';
\! touch "$TMP_DIR/settled"
SELECT pg_sleep(1);
COMMIT;
SQL
P2=$!
for _ in {1..100}; do [[ -f "$TMP_DIR/settled" ]] && break; sleep .02; done
[[ -f "$TMP_DIR/settled" ]]
"${PSQL[@]}" >"$TMP_DIR/reassign-after-settle.log" 2>&1 -c "
SELECT set_config('request.jwt.claim.sub','$ADMIN',false);
SELECT reassign_site_claimant_rpc('$SITE2','$B','Concurrent settlement wins','race-settle-first');"
wait "$P2"

# Two simultaneous retries converge on one immutable row and transfer.
SITE3="10000000-0000-0000-0000-000000000008"
"${PSQL[@]}" -c "INSERT INTO mmp_site_entries(id,accepted_by,status) VALUES ('$SITE3','$A','completed');"
for n in 1 2; do
  "${PSQL[@]}" >"$TMP_DIR/retry-$n.log" 2>&1 -c "
  SELECT set_config('request.jwt.claim.sub','$ADMIN',false);
  SELECT reassign_site_claimant_rpc('$SITE3','$B','Simultaneous retry request','same-race-key');" &
  eval "R$n=$!"
done
wait "$R1"; wait "$R2"

"${PSQL[@]}" <<SQL
DO \$\$ BEGIN
 IF (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='$SITE')<>0
 OR (SELECT effective_claimant_id FROM site_effective_claimants WHERE site_entry_id='$SITE')<>'$B'
 OR (SELECT count(*) FROM wallet_transactions WHERE site_visit_id='$SITE2')<>3
 OR (SELECT count(*) FROM site_claimant_reassignments WHERE site_entry_id='$SITE2')<>1
 OR (SELECT effective_claimant_id FROM site_effective_claimants WHERE site_entry_id='$SITE2')<>'$B'
 OR (SELECT count(*) FROM site_claimant_reassignments WHERE site_entry_id='$SITE3')<>1
 OR (SELECT count(*) FROM notifications WHERE related_entity_id='$SITE3')<>3
 THEN RAISE EXCEPTION 'concurrent terminal state did not reconcile'; END IF;
END \$\$;
SQL
echo "Claimant reassignment concurrency checks passed."