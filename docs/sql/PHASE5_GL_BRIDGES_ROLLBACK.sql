-- =============================================================================
-- PACT Accounting — Phase 5 GL Bridges · ROLLBACK
-- =============================================================================
-- Apply ONLY if you need to undo accounting_gl_bridges_phase5.sql.
-- Safe to run even if some objects don't exist (all use IF EXISTS).
-- Does NOT drop the Phase 5 expansion tables (acct_grants etc.) —
-- those are handled by PHASE5_EXPANSION_ROLLBACK.sql.
-- =============================================================================

begin;

-- 1. Drop trigger bindings
drop trigger if exists acct_bridge_cash_flow_adj   on public.acct_cash_flow_adjustments;
drop trigger if exists acct_bridge_grant_status    on public.acct_grants;
drop trigger if exists acct_bridge_grant_milestone on public.acct_grant_milestones;

-- 2. Drop trigger functions
drop function if exists public.acct_trig_cash_flow_adj()    cascade;
drop function if exists public.acct_trig_grant_status()     cascade;
drop function if exists public.acct_trig_grant_milestone()  cascade;

-- 3. Drop RPC
drop function if exists public.acct_grant_utilization()     cascade;

-- 4. Drop view
drop view if exists public.v_acct_phase5_coverage;

-- 5. Remove Phase 5 bridge feature flags
delete from public.feature_flags
where key in (
  'acct.bridge.cash_flow_adj',
  'acct.bridge.grants',
  'acct.bridge.milestones'
);

commit;

select 'Phase 5 GL Bridges rollback complete.' as result;
