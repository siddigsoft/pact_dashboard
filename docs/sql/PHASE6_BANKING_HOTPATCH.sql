-- =============================================================================
-- PACT Accounting — Phase 6 Banking Hot-patch
-- Fixes: accounting_phase6_banking.sql failed with
--   "ERROR 42703: column b.current_balance does not exist"
-- Cause: acct_bank_accounts already existed (from bank_recon_migration.sql)
--   without the current_balance column. CREATE TABLE IF NOT EXISTS skipped it.
-- =============================================================================
-- Run this in Supabase SQL Editor (abznugnirnlrqnnfkein) ONCE.
-- The main migration file has also been updated to be defensive going forward.
-- =============================================================================

-- STEP 1: Add missing columns to acct_bank_accounts ─────────────────────────

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'acct_bank_accounts'
      and column_name  = 'current_balance'
  ) then
    alter table public.acct_bank_accounts
      add column current_balance numeric(20, 2) not null default 0;
    raise notice 'current_balance column added to acct_bank_accounts.';
  else
    raise notice 'current_balance already exists — skipping.';
  end if;
end $$;

-- Also add swift_code defensive (was in old migration, keep compatible)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'acct_bank_accounts'
      and column_name  = 'swift_code'
  ) then
    alter table public.acct_bank_accounts add column swift_code text;
  end if;
end $$;

-- STEP 2: Recreate the bank recon summary RPC (was failing due to missing col)

create or replace function public.acct_bank_recon_summary(
  p_bank_account_id uuid default null
)
returns table (
  bank_account_id   uuid,
  account_name      text,
  bank_name         text,
  currency          text,
  current_balance   numeric,
  total_lines       bigint,
  matched_lines     bigint,
  excluded_lines    bigint,
  unmatched_lines   bigint,
  total_inflow      numeric,
  total_outflow     numeric,
  net_amount        numeric,
  match_rate_pct    numeric,
  last_statement_dt date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id                                                         as bank_account_id,
    b.account_name,
    b.bank_name,
    b.currency,
    b.current_balance,
    count(s.id)                                                  as total_lines,
    count(s.id) filter (where s.is_matched)                     as matched_lines,
    count(s.id) filter (where s.is_excluded)                    as excluded_lines,
    count(s.id) filter (where not s.is_matched and not s.is_excluded) as unmatched_lines,
    coalesce(sum(s.amount) filter (where s.amount > 0), 0)      as total_inflow,
    coalesce(abs(sum(s.amount) filter (where s.amount < 0)), 0) as total_outflow,
    coalesce(sum(s.amount), 0)                                   as net_amount,
    case
      when count(s.id) > 0
        then round(count(s.id) filter (where s.is_matched)::numeric
                   / count(s.id) * 100, 1)
      else 0
    end                                                          as match_rate_pct,
    max(s.statement_date)                                        as last_statement_dt
  from public.acct_bank_accounts b
  left join public.acct_bank_statement_lines s on s.bank_account_id = b.id
  where (p_bank_account_id is null or b.id = p_bank_account_id)
  group by b.id, b.account_name, b.bank_name, b.currency, b.current_balance
  order by b.account_name;
$$;

-- STEP 3: Recreate GL bridge trigger function ─────────────────────────────

create or replace function public.acct_trig_bank_line_matched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled   boolean;
  v_acct_name text;
begin
  select is_enabled into v_enabled
  from public.feature_flags
  where key = 'acct.bridge.bank_recon' limit 1;

  if v_enabled is not true then
    return new;
  end if;

  if (old.is_matched is distinct from new.is_matched) and new.is_matched = true then
    select account_name into v_acct_name
    from public.acct_bank_accounts where id = new.bank_account_id;

    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status,
      journal_entry_id, je_reference, je_description
    ) values (
      'acct_bank_statement_lines', new.id, 'line_matched', 'success',
      new.matched_journal_entry_id, null,
      format('Bank line matched — %s | %s %s | %s | JE: %s',
        coalesce(v_acct_name,'Unknown'), new.amount, new.currency,
        new.statement_date,
        coalesce(new.matched_journal_entry_id::text,'none'))
    );
  end if;

  if (old.is_matched is distinct from new.is_matched) and new.is_matched = false
     and old.is_matched = true then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, je_description
    ) values (
      'acct_bank_statement_lines', new.id, 'line_unmatched', 'success',
      format('Bank line UN-matched — was linked to JE %s',
        coalesce(old.matched_journal_entry_id::text,'none'))
    );
  end if;

  return new;
end;
$$;

-- STEP 4: Recreate coverage view ─────────────────────────────────────────

create or replace view public.v_acct_phase6_coverage as
select
  source_table,
  count(*)                                                              as total_events,
  count(*) filter (where status = 'success')                            as success_count,
  count(*) filter (where status = 'error')                              as error_count,
  count(*) filter (where status = 'skipped')                            as skipped_count,
  round(count(*) filter (where status='success')::numeric
        / nullif(count(*),0)*100, 1)                                    as success_pct,
  max(created_at)                                                       as last_event_at,
  max(created_at) filter (where status = 'error')                       as last_error_at,
  case
    when count(*) = 0                                   then 'no_data'
    when count(*) filter (where status='error') > 0     then 'degraded'
    else 'healthy'
  end                                                                   as health_status
from public.acct_gl_bridge_log
where source_table in ('acct_bank_statement_lines')
group by source_table;

-- STEP 5: Rebind trigger ──────────────────────────────────────────────────

do $guard$ begin
  if to_regclass('public.acct_bank_statement_lines') is not null then
    execute 'drop trigger if exists acct_bridge_bank_line_matched
             on public.acct_bank_statement_lines';
    execute 'create trigger acct_bridge_bank_line_matched
               after update on public.acct_bank_statement_lines
               for each row execute function public.acct_trig_bank_line_matched()';
    raise notice 'acct_bridge_bank_line_matched (re)created.';
  end if;
end $guard$;

-- STEP 6: Feature flags ───────────────────────────────────────────────────

insert into public.feature_flags (key, description, is_enabled) values
  ('acct.bridge.bank_recon',
   'Phase 6: Log GL bridge entry when a bank statement line is matched or un-matched to a journal entry.',
   true),
  ('acct.bank_recon.auto_suggest',
   'Phase 6: (Future) Auto-suggest journal entry matches for bank statement lines.',
   false)
on conflict (key) do nothing;

-- STEP 7: Smoke checks ────────────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'acct_bank_accounts'
  and column_name  = 'current_balance';
-- expect 1 row: current_balance | numeric

select * from public.acct_bank_recon_summary();
-- expect 0 rows (or live data rows) — no error

select 'Phase 6 hot-patch complete.' as result;
