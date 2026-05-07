-- =============================================================================
-- PACT Accounting — Phase 7 Rollback
-- Removes all Phase 7 objects in reverse dependency order.
-- Run ONLY if you need to undo accounting_phase7_statutory.sql.
-- =============================================================================

-- 1. Triggers
drop trigger if exists acct_bridge_statutory_filing_paid on public.acct_statutory_filings;
drop trigger if exists acct_statutory_filings_updated_at on public.acct_statutory_filings;
drop trigger if exists acct_tax_wh_updated_at on public.acct_tax_withholding;

-- 2. Trigger & utility functions
drop function if exists public.acct_trig_statutory_filing_paid() cascade;
drop function if exists public.acct_flag_overdue_filings() cascade;
drop function if exists public.update_acct_statutory_filings_updated_at() cascade;
drop function if exists public.update_acct_tax_withholding_updated_at() cascade;

-- 3. RPCs
drop function if exists public.acct_compute_pit(numeric, text, date) cascade;
drop function if exists public.acct_statutory_summary(uuid) cascade;

-- 4. View
drop view if exists public.v_acct_phase7_coverage cascade;

-- 5. Tables (data-destructive — back up first)
drop table if exists public.acct_statutory_filings cascade;
drop table if exists public.acct_tax_withholding cascade;
drop table if exists public.acct_zakat_config cascade;
drop table if exists public.acct_social_rates cascade;
drop table if exists public.acct_tax_brackets cascade;

-- 6. Feature flags
delete from public.feature_flags
where key in (
  'acct.statutory.pit',
  'acct.statutory.social',
  'acct.statutory.zakat',
  'acct.bridge.statutory_filing'
);

select 'Phase 7 rollback complete.' as result;
