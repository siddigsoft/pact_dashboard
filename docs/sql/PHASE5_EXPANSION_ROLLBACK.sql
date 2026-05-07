-- =============================================================================
-- PACT Accounting — Phase 5 Expansion · ROLLBACK
-- =============================================================================
-- Apply ONLY if you need to undo 20260502_acct_phase5_expansion.sql.
-- DESTRUCTIVE — drops all Phase 5 tables and feature flags.
--
-- ⚠️  Phase 4 GL bridge triggers reference acct_depreciation_runs and
--     acct_allocation_runs. Run PHASE4_GL_BRIDGES_ROLLBACK.sql first if
--     those bridges are live, otherwise the trigger DROP will fail.
-- =============================================================================

begin;

-- 1. Drop dependent tables first (FK children)
drop table if exists public.acct_grant_expenses        cascade;

-- 2. Drop parent tables
drop table if exists public.acct_grants                cascade;
drop table if exists public.acct_allocation_runs       cascade;
drop table if exists public.acct_cost_allocation_rules cascade;
drop table if exists public.acct_depreciation_runs     cascade;
drop table if exists public.acct_cash_flow_adjustments cascade;

-- 3. Remove Phase 5 feature flags
delete from public.feature_flags
where key in (
  'acct.grants.enabled',
  'acct.cost_allocation.enabled',
  'acct.depreciation_auto'
);

commit;

select 'Phase 5 Expansion rollback complete.' as result;
