-- Bug fix (contract renewal visibility): src/components/hr/ContractRenewal.tsx has
-- always selected and filtered on `profiles.renewal_status`, but this column was
-- never created by any migration — every query against it either errored or (with
-- PostgREST's lenient select) silently returned null for every row, so the KPI
-- counts, status filter, and "Mark Renewed / Contacted / Ended" actions never
-- persisted anywhere real.
--
-- Run this manually against the Supabase database (per project convention: all
-- accounting/HR SQL is applied by the user, not auto-run by the agent).

alter table public.profiles
  add column if not exists renewal_status text
  check (renewal_status in ('pending', 'contacted', 'renewed', 'ended'));

comment on column public.profiles.renewal_status is
  'HR contract-renewal workflow status for this employee''s current contract term. NULL/pending = not yet actioned, contacted = reminder sent, renewed = new end date set, ended = employment not being renewed. Reset to NULL/pending whenever contract_end_date is updated to a new term.';

create index if not exists idx_profiles_renewal_status on public.profiles (renewal_status) where renewal_status is not null;
