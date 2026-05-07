-- =============================================================================
-- PACT Accounting — Phase 3 GL Bridge Extension · ROLLBACK
-- =============================================================================
-- Apply ONLY if you need to undo the Phase 3 migration.
-- DESTRUCTIVE — drops triggers, functions, views, and RPCs added by Phase 3.
--
-- ⚠️  This does NOT delete journal entries already posted by the bridges.
--     Posted journals are immutable by design.
--     Run this only if Phase 3 was never live on real data.
--
-- ⚠️  COA accounts (1520, 2350, 5600, 6200) are left in place because they
--     may already have journal lines referencing them.
-- =============================================================================

begin;

-- 1. Drop trigger bindings
drop trigger if exists acct_bridge_eosb_accruals             on public.eosb_accruals;
drop trigger if exists acct_bridge_hr_salary_advances        on public.hr_salary_advances;
drop trigger if exists acct_bridge_hr_salary_advance_recoveries on public.hr_salary_advance_recoveries;
drop trigger if exists acct_bridge_grant_expenses            on public.acct_grant_expenses;
drop trigger if exists acct_payroll_advance_recovery         on public.payroll_run_items;

-- 2. Drop trigger functions
drop function if exists public.acct_trig_eosb_accruals()                      cascade;
drop function if exists public.acct_trig_hr_salary_advances()                 cascade;
drop function if exists public.acct_trig_hr_salary_advance_recoveries()       cascade;
drop function if exists public.acct_trig_grant_expenses()                     cascade;
drop function if exists public.acct_trig_payroll_advance_recovery()           cascade;

-- 3. Drop RPCs
drop function if exists public.run_period_close_allocation(uuid)              cascade;
drop function if exists public.get_gl_bridge_log(text, text, date, date, int) cascade;

-- 4. Drop coverage view
drop view if exists public.acct_gl_bridge_coverage;

-- 5. Remove Phase 3 feature flags
delete from public.feature_flags
where key in (
  'acct.bridge.eosb_accruals',
  'acct.bridge.hr_salary_advances',
  'acct.bridge.hr_salary_advance_recoveries',
  'acct.bridge.acct_grant_expenses'
);

-- 6. Remove columns added by Phase 3 (only if no data exists)
-- salary_advance columns on payroll_run_items
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'payroll_run_items'
       and column_name  = 'salary_advance_deduction'
  ) then
    alter table public.payroll_run_items
      drop column if exists salary_advance_deduction,
      drop column if exists salary_advance_ids;
    raise notice 'Dropped salary_advance_deduction / salary_advance_ids from payroll_run_items.';
  end if;
end $$;

-- rule_name on acct_cost_allocation_rules
alter table public.acct_cost_allocation_rules
  drop column if exists rule_name,
  drop column if exists driver_amount,
  drop column if exists source_account_code;

-- driver_amount + rule_name on acct_allocation_runs / acct_cost_allocation_rules
alter table public.acct_allocation_runs
  drop column if exists period_id,
  drop column if exists notes;

-- hire_date on profiles (safe — drop only if column exists and contains no data)
do $$ begin
  if not exists (
    select 1 from public.profiles where hire_date is not null limit 1
  ) then
    alter table public.profiles drop column if exists hire_date;
    raise notice 'Dropped profiles.hire_date (no data present).';
  else
    raise notice 'SKIP: profiles.hire_date has data — column NOT dropped. Remove manually if intended.';
  end if;
exception when others then
  raise notice 'hire_date rollback skipped: %', sqlerrm;
end $$;

-- ⚠️  COA accounts 1520, 2350, 5600, 6200 are intentionally left in place.
--     To remove them manually (only if no journal lines reference them):
-- DELETE FROM public.acct_accounts WHERE code IN ('1520','2350','5600','6200')
--   AND NOT EXISTS (
--     SELECT 1 FROM public.acct_journal_lines jl
--      WHERE jl.account_id = acct_accounts.id
--   );

commit;

select 'Phase 3 GL Bridge rollback complete.' as result;
