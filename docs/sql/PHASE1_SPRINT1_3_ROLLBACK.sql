-- =============================================================================
-- PACT Accounting — Phase 1 · Sprint 1.3 ROLLBACK
-- Removes ONLY Sprint 1.3 objects + any rows the synthetic generator created.
-- Sprint 1.1 + 1.2 objects (acct_post_journal, acct_screen_party, audit
-- triggers, sanctions tables) are left intact.
--
-- Apply procedure:
--   1. Paste this entire file into the pactdb SQL editor.
--   2. Run.
-- =============================================================================

set search_path = public;

-- 1. Wipe synthetic data first (registry-driven; never touches real rows)

delete from public.acct_journal_lines
  where entry_id in (
    select row_id from public.acct_synthetic_marker
     where table_name = 'acct_journal_entries'
  );

delete from public.acct_journal_entries
  where id in (
    select row_id from public.acct_synthetic_marker
     where table_name = 'acct_journal_entries'
  );

delete from public.acct_aml_alerts
  where partner_id in (
    select row_id from public.acct_synthetic_marker
     where table_name = 'partners'
  );

delete from public.acct_sanctioned_parties
  where id in (
    select row_id from public.acct_synthetic_marker
     where table_name = 'acct_sanctioned_parties'
  );

do $$
begin
  if to_regclass('public.partners') is not null then
    execute 'delete from public.partners where id in (select row_id from public.acct_synthetic_marker where table_name = ''partners'')';
  end if;
end $$;

delete from public.acct_funds
  where id in (
    select row_id from public.acct_synthetic_marker
     where table_name = 'acct_funds'
  );

-- 2. Drop Sprint 1.3 functions

drop function if exists public.acct_run_test_suite(uuid, uuid);
drop function if exists public.acct_seed_synthetic(int, boolean, numeric);

-- 3. Drop the registry table last

drop table if exists public.acct_synthetic_marker;

-- =============================================================================
-- Rollback complete. Sprint 1.1 + 1.2 surface remains operational.
-- =============================================================================
