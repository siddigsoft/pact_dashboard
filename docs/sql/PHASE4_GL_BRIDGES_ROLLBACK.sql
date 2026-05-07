-- =============================================================================
-- PACT Accounting — Phase 4 GL Bridge Extension · ROLLBACK
-- =============================================================================
-- Apply ONLY if you need to undo the Phase 4 migration.
-- DESTRUCTIVE — drops triggers and functions added by Phase 4.
--
-- ⚠️  Does NOT delete posted journals — those are immutable.
-- ⚠️  COA accounts (1600, 2105, 2240, 6400) left in place — may have journal lines.
-- =============================================================================

begin;

-- 1. Drop trigger bindings
drop trigger if exists acct_bridge_depreciation_runs     on public.acct_depreciation_runs;
drop trigger if exists acct_bridge_allocation_runs       on public.acct_allocation_runs;
drop trigger if exists acct_bridge_budget_encumbrances   on public.acct_budget_encumbrances;
drop trigger if exists acct_bridge_leave_requests        on public.leave_requests;

-- 2. Drop trigger functions
drop function if exists public.acct_trig_depreciation_runs()    cascade;
drop function if exists public.acct_trig_allocation_runs()      cascade;
drop function if exists public.acct_trig_budget_encumbrances()  cascade;
drop function if exists public.acct_trig_leave_requests()       cascade;

-- 3. Remove Phase 4 feature flags
delete from public.feature_flags
where key in (
  'acct.bridge.acct_depreciation_runs',
  'acct.bridge.acct_allocation_runs',
  'acct.bridge.acct_fixed_assets',
  'acct.bridge.acct_budget_encumbrances',
  'acct.bridge.leave_requests'
);

-- 4. Revert payroll_run_items user_id generated column (if it was added by Phase 4)
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'payroll_run_items'
       and column_name  = 'user_id'
       and is_generated = 'ALWAYS'
  ) then
    alter table public.payroll_run_items drop column if exists user_id;
    raise notice 'Dropped generated user_id column from payroll_run_items.';
  else
    raise notice 'SKIP: payroll_run_items.user_id is not a generated column — not dropped.';
  end if;
exception when others then
  raise notice 'payroll_run_items.user_id rollback skipped: %', sqlerrm;
end $$;

-- ⚠️  COA accounts 1600, 2105, 2240, 6400 left in place.
--     To remove manually (only if no journal lines exist):
-- DELETE FROM public.acct_accounts
--   WHERE code IN ('1600','2105','2240','6400')
--     AND NOT EXISTS (
--       SELECT 1 FROM public.acct_journal_lines jl
--        WHERE jl.account_id = acct_accounts.id
--     );

commit;

select 'Phase 4 GL Bridge rollback complete.' as result;
