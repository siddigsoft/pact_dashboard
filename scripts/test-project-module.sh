#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d /tmp/pact-project-module.XXXXXX)"
cleanup() { pg_ctl -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
mkdir "$work/socket"
initdb -D "$work/data" -A trust -U "$(id -un)" >/dev/null
pg_ctl -D "$work/data" -l "$work/server.log" -o "-k $work/socket -p 55478 -c listen_addresses=''" start >/dev/null
export PGHOST="$work/socket" PGPORT=55478 PGUSER="$(id -un)" PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q -f scripts/tests/project-module.sql
# A child insertion racing with deletion must not be silently cascaded away.
PGAPPNAME=project-module-writer psql -X -v ON_ERROR_STOP=1 -q >"$work/writer.log" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO public.operational_cost_submissions(project_id,amount_cents) VALUES('10000000-0000-4000-8000-000000000005',100);
SELECT pg_sleep(2);
COMMIT;
SQL
writer=$!
ready=false
for attempt in $(seq 1 40); do
  if [ "$(psql -X -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name='project-module-writer' AND wait_event='PgSleep'")" = 1 ]; then ready=true; break; fi
  sleep 0.05
done
if [ "$ready" != true ]; then wait "$writer"; echo "Concurrent writer did not reach the synchronization point"; exit 1; fi
if psql -X -v ON_ERROR_STOP=1 -q >"$work/delete.log" 2>&1 <<'SQL'
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.delete_empty_project_safely('10000000-0000-4000-8000-000000000005','Project 5');
SQL
then
  echo "FAIL: deletion ignored the concurrent child insertion"; exit 1
fi
wait "$writer"
grep -q 'linked records' "$work/delete.log" || { cat "$work/delete.log"; exit 1; }
test "$(psql -X -Atc "SELECT count(*) FROM public.operational_cost_submissions WHERE project_id='10000000-0000-4000-8000-000000000005'")" = 1
echo "Project module SQL regression checks passed."
