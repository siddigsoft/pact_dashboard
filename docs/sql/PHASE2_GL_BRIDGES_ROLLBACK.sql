-- =============================================================================
-- PACT Accounting — Phase 2 GL Bridge Engine · ROLLBACK
-- =============================================================================
-- Apply ONLY if you need to undo the Phase 2 migration.
-- This is DESTRUCTIVE — it drops all bridge triggers, functions, P2P tables,
-- and removes Phase 2 feature flags and COA accounts.
--
-- ⚠️  This will NOT delete any journal entries already posted by the bridges.
--     Posted journals are immutable by design. Run the below only if Phase 2
--     was never live on real data.
-- =============================================================================

begin;

-- 1. Drop trigger bindings first (before dropping functions)
drop trigger if exists acct_bridge_payroll_runs           on public.payroll_runs;
drop trigger if exists acct_bridge_withdrawal_requests    on public.withdrawal_requests;
drop trigger if exists acct_bridge_ops_cost               on public.operational_cost_submissions;
drop trigger if exists acct_bridge_down_payments          on public.down_payment_requests;
drop trigger if exists acct_bridge_salary_advances        on public.salary_advances;
drop trigger if exists acct_bridge_wallet_reward          on public.wallet_transactions;
drop trigger if exists acct_bridge_invoice_approved       on public.acct_invoices;
drop trigger if exists acct_bridge_payment_processed      on public.acct_payments;

-- 2. Drop P2P tables (cascade removes lines and allocations)
drop table if exists public.acct_payment_allocations    cascade;
drop table if exists public.acct_payments               cascade;
drop table if exists public.acct_invoice_lines          cascade;
drop table if exists public.acct_invoices               cascade;
drop table if exists public.acct_grn_lines              cascade;
drop table if exists public.acct_grn_receipts           cascade;
drop table if exists public.acct_po_lines               cascade;
drop table if exists public.acct_purchase_orders        cascade;
drop table if exists public.acct_pr_lines               cascade;
drop table if exists public.acct_purchase_requisitions  cascade;
drop table if exists public.acct_cheque_register        cascade;

-- 3. Drop bridge log and summary view
drop view  if exists public.v_acct_gl_bridge_summary;
drop table if exists public.acct_gl_bridge_log          cascade;

-- 4. Drop bridge trigger functions
drop function if exists public.acct_trig_payroll_runs()                  cascade;
drop function if exists public.acct_trig_withdrawal_requests()           cascade;
drop function if exists public.acct_trig_operational_cost_submissions()  cascade;
drop function if exists public.acct_trig_down_payment_requests()         cascade;
drop function if exists public.acct_trig_salary_advances()               cascade;
drop function if exists public.acct_trig_wallet_reward()                 cascade;
drop function if exists public.acct_trig_invoice_approved()              cascade;
drop function if exists public.acct_trig_payment_processed()             cascade;

-- 5. Drop bridge helper functions
drop function if exists public.acct_bridge_post_journal(text, uuid, text, date, text, text, jsonb, uuid) cascade;
drop function if exists public.acct_bridge_ops_cost_account(text)        cascade;
drop function if exists public.acct_recon_subledger_check(date)          cascade;

-- 6. Drop sequences and number generators
drop function if exists public.acct_next_pr_number()  cascade;
drop function if exists public.acct_next_po_number()  cascade;
drop function if exists public.acct_next_grn_number() cascade;
drop function if exists public.acct_next_inv_number() cascade;
drop function if exists public.acct_next_pmt_number() cascade;
drop function if exists public.acct_next_chq_number() cascade;
drop sequence if exists public.acct_pr_seq;
drop sequence if exists public.acct_po_seq;
drop sequence if exists public.acct_grn_seq;
drop sequence if exists public.acct_inv_seq;
drop sequence if exists public.acct_pmt_seq;
drop sequence if exists public.acct_chq_seq;

-- 7. Remove Phase 2 feature flags
delete from public.feature_flags
where key in (
  'acct.bridge.payroll_runs',
  'acct.bridge.withdrawal_requests',
  'acct.bridge.operational_cost_submissions',
  'acct.bridge.down_payment_requests',
  'acct.bridge.salary_advances',
  'acct.bridge.wallet_transactions',
  'acct.p2p.enabled'
);

-- 8. Remove Phase 2 COA accounts (only safe if no journal lines reference them)
-- ⚠️ Skipped by default — comment in if you are certain no GL lines exist for these codes
-- delete from public.acct_accounts where code in ('2600','2610','2620','5050','5060','5070');

commit;

-- Verification
select count(*) as remaining_bridge_triggers
from pg_trigger
where tgname like 'acct_bridge_%';  -- expect 0

select count(*) as remaining_p2p_tables
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'acct_purchase_requisitions','acct_purchase_orders','acct_grn_receipts',
    'acct_invoices','acct_payments','acct_cheque_register'
  );  -- expect 0
