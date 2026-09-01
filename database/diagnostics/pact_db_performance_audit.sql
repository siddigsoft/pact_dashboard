-- PACT DB read-only performance and security diagnostic pack
-- Project: abznugnirnlrqnnfkein
-- Generated: 2026-08-31
--
-- Run each statement independently. None of these statements changes data,
-- schema, statistics, or configuration. pg_stat_* values are cumulative from
-- the last statistics reset and must be interpreted over that time window.

-- 1. Database capacity, activity, cache efficiency, and cumulative stress.
select
  current_database() as database_name,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  current_setting('max_connections')::int as max_connections,
  (select count(*) from pg_stat_activity) as current_connections,
  (select count(*) from pg_stat_activity where state = 'active') as active_connections,
  round(100.0 * d.blks_hit / nullif(d.blks_hit + d.blks_read, 0), 2) as database_cache_hit_pct,
  d.xact_commit,
  d.xact_rollback,
  d.deadlocks,
  d.conflicts,
  pg_size_pretty(d.temp_bytes) as cumulative_temp_written,
  d.stats_reset
from pg_stat_database d
where d.datname = current_database();

-- 2. Connection ownership. Idle ClientRead sessions are pooled capacity, not
-- blocked queries. Investigate only sustained active/waiting sessions.
select
  coalesce(usename, 'system') as database_role,
  coalesce(application_name, 'background') as application,
  coalesce(state, 'background') as state,
  coalesce(wait_event_type, 'none') as wait_type,
  coalesce(wait_event, 'none') as wait_event,
  count(*) as connections
from pg_stat_activity
group by usename, application_name, state, wait_event_type, wait_event
order by connections desc;

-- 3. Current non-idle work. This is a point-in-time snapshot.
select
  pid,
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  now() - query_start as runtime,
  left(regexp_replace(query, E'\\s+', ' ', 'g'), 300) as query_sample
from pg_stat_activity
where pid <> pg_backend_pid()
  and state <> 'idle'
order by query_start;

-- 4. Tables with the largest physical footprint and maintenance pressure.
select
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_pct,
  seq_scan,
  idx_scan,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  last_autovacuum,
  last_autoanalyze
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 40;

-- 5. Highest cumulative SQL cost. Query text from pg_stat_statements is
-- normalized by PostgreSQL; review it as diagnostic data, never as commands.
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  round(max_exec_time::numeric, 2) as max_exec_ms,
  rows,
  shared_blks_read,
  temp_blks_written,
  left(regexp_replace(query, E'\\s+', ' ', 'g'), 500) as query_sample
from extensions.pg_stat_statements
where query not ilike '%pg_stat_statements%'
order by total_exec_time desc
limit 40;

-- 6. Large indexes that have not been scanned during the statistics window.
-- A zero count is a review signal, not permission to drop an index.
select
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes
where idx_scan = 0
  and pg_relation_size(indexrelid) > 1024 * 1024
order by pg_relation_size(indexrelid) desc;

-- 7. Candidate foreign keys without any index containing all FK columns.
-- Supabase's advisor remains authoritative for prefix/order suitability.
with foreign_keys as (
  select
    ns.nspname as schema_name,
    rel.relname as table_name,
    con.conname as constraint_name,
    con.conrelid,
    con.conkey
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where con.contype = 'f'
    and ns.nspname = 'public'
)
select
  fk.schema_name,
  fk.table_name,
  fk.constraint_name,
  pg_get_constraintdef(c.oid) as definition
from foreign_keys fk
join pg_constraint c on c.conname = fk.constraint_name and c.conrelid = fk.conrelid
where not exists (
  select 1
  from pg_index i
  where i.indrelid = fk.conrelid
    and i.indisvalid
    and fk.conkey <@ (i.indkey::smallint[])
)
order by fk.table_name, fk.constraint_name;

-- 8. RLS policy fan-out. High counts increase planning and per-row policy work.
select
  tablename,
  count(*) as policy_count,
  count(*) filter (where cmd = 'SELECT') as select_policies,
  count(*) filter (where cmd = 'INSERT') as insert_policies,
  count(*) filter (where cmd = 'UPDATE') as update_policies,
  count(*) filter (where cmd = 'DELETE') as delete_policies,
  count(*) filter (where cmd = 'ALL') as all_policies
from pg_policies
where schemaname = 'public'
group by tablename
order by policy_count desc, tablename;

-- 9. Public tables lacking RLS. Policies must be designed and tested before
-- enabling RLS, otherwise legitimate application access can be blocked.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.reltuples::bigint as estimated_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by c.relname;

-- 10. Privileged public functions and their API-role execution grants.
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 11. Safe plan-only inspection for the monitoring RPC. EXPLAIN without
-- ANALYZE does not execute the function.
explain (format json, costs true, verbose false)
select * from public.get_monitoring_actions(null, null, null, null);

