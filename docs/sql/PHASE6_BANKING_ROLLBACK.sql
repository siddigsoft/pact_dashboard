-- =============================================================================
-- PACT Accounting — Phase 6 Banking & Treasury · ROLLBACK
-- =============================================================================
-- Undoes accounting_phase6_banking.sql.
-- Safe to run even if objects don't exist (all use IF EXISTS).
-- WARNING: drops acct_bank_accounts and acct_bank_statement_lines and all
-- their data. Back up first if live data exists.
-- =============================================================================

begin;

-- 1. Drop trigger bindings
drop trigger if exists acct_bridge_bank_line_matched on public.acct_bank_statement_lines;
drop trigger if exists trg_bank_accounts_updated_at  on public.acct_bank_accounts;

-- 2. Drop trigger functions
drop function if exists public.acct_trig_bank_line_matched()  cascade;
drop function if exists public.acct_bank_accounts_updated_at() cascade;

-- 3. Drop RPC
drop function if exists public.acct_bank_recon_summary(uuid) cascade;

-- 4. Drop view
drop view if exists public.v_acct_phase6_coverage;

-- 5. Drop tables (cascades to statement lines if accounts dropped first)
drop table if exists public.acct_bank_statement_lines cascade;
drop table if exists public.acct_bank_accounts        cascade;

-- 6. Remove feature flags
delete from public.feature_flags
where key in ('acct.bridge.bank_recon', 'acct.bank_recon.auto_suggest');

commit;

select 'Phase 6 Banking rollback complete.' as result;
