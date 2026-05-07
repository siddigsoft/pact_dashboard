-- =============================================================================
-- PACT Accounting — Phase 8 Rollback
-- Removes all Phase 8 objects in reverse dependency order.
-- Run ONLY if you need to undo accounting_phase8_audit_pack.sql.
-- WARNING: Drops all audit pack data permanently.
-- =============================================================================

-- 1. Triggers on acct_auditor_findings
drop trigger if exists acct_finding_counter_ins on public.acct_auditor_findings;
drop trigger if exists acct_finding_counter_upd on public.acct_auditor_findings;
drop trigger if exists acct_finding_counter_del on public.acct_auditor_findings;
drop trigger if exists acct_auditor_findings_updated_at on public.acct_auditor_findings;

-- 2. Triggers on acct_audit_packs
drop trigger if exists acct_bridge_audit_pack_finalized on public.acct_audit_packs;
drop trigger if exists acct_audit_packs_updated_at on public.acct_audit_packs;

-- 3. Trigger & utility functions
drop function if exists public.acct_trig_audit_pack_finalized() cascade;
drop function if exists public.acct_trig_finding_counter() cascade;
drop function if exists public.update_acct_audit_packs_updated_at() cascade;
drop function if exists public.update_acct_auditor_findings_updated_at() cascade;

-- 4. RPCs
drop function if exists public.acct_generate_audit_pack(uuid, text, text) cascade;
drop function if exists public.acct_audit_pack_summary(uuid) cascade;

-- 5. View
drop view if exists public.v_acct_phase8_coverage cascade;

-- 6. Tables (data-destructive)
drop table if exists public.acct_auditor_findings cascade;
drop table if exists public.acct_audit_pack_items cascade;
drop table if exists public.acct_audit_packs cascade;

-- 7. Feature flags
delete from public.feature_flags
where key in (
  'acct.audit_pack.enabled',
  'acct.auditor_portal.enabled',
  'acct.bridge.audit_pack'
);

select 'Phase 8 rollback complete.' as result;
