-- =============================================================================
-- PACT Accounting — Phase 4 Advanced Controls · ROLLBACK
-- =============================================================================
-- Apply ONLY if you need to undo 20260520_acct_phase4_advanced.sql.
-- DESTRUCTIVE — drops tables, functions, and columns added by this migration.
--
-- ⚠️  Dropping acct_budget_encumbrances will block the Phase 4 bridge trigger.
--     Apply PHASE4_GL_BRIDGES_ROLLBACK.sql first if Phase 4 bridges are live.
-- =============================================================================

begin;

-- 1. Drop triggers
drop trigger if exists trg_acct_tax_codes_updated_at on public.acct_tax_codes;

-- 2. Drop functions
drop function if exists public.acct_tax_codes_updated_at() cascade;
drop function if exists public.acct_get_exchange_rate(text, text, date) cascade;
drop function if exists public.acct_tax_summary() cascade;

-- 3. Drop tables (cascade handles FK children)
drop table if exists public.acct_budget_encumbrances cascade;
drop table if exists public.acct_period_close_log    cascade;
drop table if exists public.acct_exchange_rates      cascade;
drop table if exists public.acct_tax_codes           cascade;

-- 4. Remove tax_code_id column from acct_invoices
alter table public.acct_invoices
  drop column if exists tax_code_id;

-- 5. Remove Phase 4 Advanced feature flags
delete from public.feature_flags
where key in (
  'acct.multi_currency.enabled',
  'acct.tax.auto_apply',
  'acct.encumbrance.enabled',
  'acct.period_auto_close'
);

commit;

select 'Phase 4 Advanced Controls rollback complete.' as result;
