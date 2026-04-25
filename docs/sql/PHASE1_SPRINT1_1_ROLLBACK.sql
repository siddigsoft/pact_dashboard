-- =============================================================================
-- PACT Accounting — Phase 1 Sprint 1.1 ROLLBACK
-- =============================================================================
-- Reverses 20260501_acct_phase1_sprint1_1.sql.
-- Apply ONLY if Sprint 1.1 must be fully removed (greenfield ⇒ greenfield).
-- Refuses to drop if any production journal entries exist.
-- =============================================================================

begin;

-- Safety: refuse rollback if there are posted journals
do $$
declare
  v_count int;
begin
  if to_regclass('public.acct_journal_entries') is not null then
    select count(*) into v_count
      from public.acct_journal_entries
     where status = 'posted';
    if v_count > 0 then
      raise exception 'ROLLBACK_BLOCKED: % posted journal entries exist. '
                      'Reverse them via contra-entries first, or use a targeted '
                      'archive procedure instead of full rollback.', v_count;
    end if;
  end if;
end $$;

-- Drop functions
drop function if exists public.acct_post_journal(jsonb, text);
drop function if exists public.acct_trial_balance(uuid, uuid, uuid);
drop function if exists public.feature_enabled(text, uuid);

-- Drop trigger + helper
drop trigger if exists trg_acct_jl_immutable on public.acct_journal_lines;
drop function if exists public.acct_jl_immutability_guard();

-- Drop tables (in reverse dependency order)
drop table if exists public.acct_journal_lines    cascade;
drop table if exists public.acct_journal_entries  cascade;
drop table if exists public.acct_fiscal_periods   cascade;
drop table if exists public.acct_fiscal_years     cascade;
drop table if exists public.acct_accounts         cascade;
drop table if exists public.acct_funds            cascade;
drop table if exists public.feature_flags         cascade;

-- Drop enums (only if no other table uses them)
do $$ begin
  drop type if exists acct_journal_status;
exception when dependent_objects_still_exist then null; end $$;

do $$ begin
  drop type if exists acct_period_status;
exception when dependent_objects_still_exist then null; end $$;

do $$ begin
  drop type if exists acct_account_subtype;
exception when dependent_objects_still_exist then null; end $$;

do $$ begin
  drop type if exists acct_account_type;
exception when dependent_objects_still_exist then null; end $$;

do $$ begin
  drop type if exists acct_restriction_type;
exception when dependent_objects_still_exist then null; end $$;

commit;

-- =============================================================================
-- Verify rollback
-- =============================================================================
-- select count(*) from information_schema.tables
--  where table_schema='public' and table_name like 'acct\_%' escape '\';
-- -- Expected: 0
-- select count(*) from pg_type
--  where typname like 'acct\_%' escape '\';
-- -- Expected: 0
