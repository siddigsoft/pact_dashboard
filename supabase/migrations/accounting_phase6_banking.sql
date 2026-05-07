-- =============================================================================
-- PACT Accounting — Phase 6 Banking & Treasury
-- Creates the tables the Bank Reconciliation and Cheque Register pages need.
--
-- New objects:
--   acct_bank_accounts       — multi-bank account registry
--   acct_bank_statement_lines — uploaded / manually entered statement lines
--   acct_bank_recon_summary() — per-bank reconciliation summary RPC
--   acct_trig_bank_line_matched() — GL bridge visibility on line match
--   v_acct_phase6_coverage    — Phase 6 bridge health view
--   Feature flags: acct.bridge.bank_recon, acct.bank_recon.auto_suggest
--
-- Prerequisites:
--   20260501_acct_phase1_sprint1_1.sql   (acct_accounts, acct_journal_entries)
--   20260520_acct_phase2_gl_bridges.sql  (acct_gl_bridge_log, acct_cheque_register)
--   accounting_gl_bridges_phase3.sql     (je_reference / je_description columns on bridge log)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + to_regclass guards on triggers
-- =============================================================================

-- =============================================================================
-- PART A: Infrastructure guard
-- =============================================================================

do $infra$ begin
  if to_regclass('public.acct_gl_bridge_log') is null then
    raise exception
      'acct_gl_bridge_log not found — apply accounting_gl_bridges_phase2.sql first';
  end if;
end $infra$;

-- =============================================================================
-- PART B: acct_bank_accounts
-- One row per physical bank account (operations, savings, mobile-money wallet).
-- Referenced by: AccountingBankRecon, AccountingChequeRegister,
--                AccountingCashFlowForecast (reads current_balance).
-- =============================================================================

create table if not exists public.acct_bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  account_name     text not null,
  bank_name        text not null,
  account_number   text,
  currency         text not null default 'USD',
  country_id       uuid references public.countries(id) on delete set null,
  gl_account_id    uuid references public.acct_accounts(id) on delete set null,
  is_active        boolean not null default true,
  current_balance  numeric(20, 2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_acct_bank_accts_active
  on public.acct_bank_accounts (is_active);
create index if not exists idx_acct_bank_accts_currency
  on public.acct_bank_accounts (currency);

alter table public.acct_bank_accounts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_bank_accounts' and policyname = 'bank_accounts_all'
  ) then
    execute 'create policy "bank_accounts_all" on public.acct_bank_accounts
             for all using (true) with check (true)';
  end if;
end $$;

grant select, insert, update on public.acct_bank_accounts to authenticated;

-- Trigger: keep updated_at current
create or replace function public.acct_bank_accounts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

do $tr_ba$ begin
  if to_regclass('public.acct_bank_accounts') is not null then
    execute 'drop trigger if exists trg_bank_accounts_updated_at on public.acct_bank_accounts';
    execute 'create trigger trg_bank_accounts_updated_at
               before update on public.acct_bank_accounts
               for each row execute function public.acct_bank_accounts_updated_at()';
  end if;
end $tr_ba$;

-- =============================================================================
-- PART C: acct_bank_statement_lines
-- One row per line from a bank statement (CSV import or manual entry).
-- Matched against acct_journal_entries for reconciliation.
-- =============================================================================

create table if not exists public.acct_bank_statement_lines (
  id                       uuid primary key default gen_random_uuid(),
  bank_account_id          uuid not null
                             references public.acct_bank_accounts(id) on delete cascade,
  statement_date           date not null,
  description              text,
  reference                text,
  amount                   numeric(20, 2) not null,      -- positive = inflow, negative = outflow
  running_balance          numeric(20, 2),
  currency                 text not null default 'USD',
  is_matched               boolean not null default false,
  is_excluded              boolean not null default false,
  matched_journal_entry_id uuid references public.acct_journal_entries(id) on delete set null,
  matched_at               timestamptz,
  match_note               text,
  created_at               timestamptz not null default now()
);

create index if not exists idx_acct_stmt_bank_acct
  on public.acct_bank_statement_lines (bank_account_id);
create index if not exists idx_acct_stmt_date
  on public.acct_bank_statement_lines (statement_date desc);
create index if not exists idx_acct_stmt_matched
  on public.acct_bank_statement_lines (is_matched, is_excluded);
create index if not exists idx_acct_stmt_je
  on public.acct_bank_statement_lines (matched_journal_entry_id)
  where matched_journal_entry_id is not null;

alter table public.acct_bank_statement_lines enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_bank_statement_lines' and policyname = 'stmt_lines_all'
  ) then
    execute 'create policy "stmt_lines_all" on public.acct_bank_statement_lines
             for all using (true) with check (true)';
  end if;
end $$;

grant select, insert, update, delete on public.acct_bank_statement_lines to authenticated;

-- =============================================================================
-- PART D: Bank Recon Summary RPC
-- Returns per-bank reconciliation stats: total lines, matched, unmatched,
-- excluded, net inflow, net outflow, and any balance difference.
-- Called by AccountingBankRecon.tsx summary panel.
-- =============================================================================

create or replace function public.acct_bank_recon_summary(
  p_bank_account_id uuid default null
)
returns table (
  bank_account_id   uuid,
  account_name      text,
  bank_name         text,
  currency          text,
  current_balance   numeric,
  total_lines       bigint,
  matched_lines     bigint,
  excluded_lines    bigint,
  unmatched_lines   bigint,
  total_inflow      numeric,
  total_outflow     numeric,
  net_amount        numeric,
  match_rate_pct    numeric,
  last_statement_dt date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id                                                         as bank_account_id,
    b.account_name,
    b.bank_name,
    b.currency,
    b.current_balance,
    count(s.id)                                                  as total_lines,
    count(s.id) filter (where s.is_matched)                     as matched_lines,
    count(s.id) filter (where s.is_excluded)                    as excluded_lines,
    count(s.id) filter (where not s.is_matched and not s.is_excluded) as unmatched_lines,
    coalesce(sum(s.amount) filter (where s.amount > 0), 0)      as total_inflow,
    coalesce(abs(sum(s.amount) filter (where s.amount < 0)), 0) as total_outflow,
    coalesce(sum(s.amount), 0)                                   as net_amount,
    case
      when count(s.id) > 0
        then round(count(s.id) filter (where s.is_matched)::numeric
                   / count(s.id) * 100, 1)
      else 0
    end                                                          as match_rate_pct,
    max(s.statement_date)                                        as last_statement_dt
  from public.acct_bank_accounts b
  left join public.acct_bank_statement_lines s on s.bank_account_id = b.id
  where (p_bank_account_id is null or b.id = p_bank_account_id)
  group by b.id, b.account_name, b.bank_name, b.currency, b.current_balance
  order by b.account_name;
$$;

-- =============================================================================
-- PART E: GL bridge trigger for bank statement line matching
-- Fires AFTER UPDATE on acct_bank_statement_lines when is_matched flips true.
-- Logs a visibility entry to acct_gl_bridge_log linking the statement line
-- to the matched journal entry — gives auditors a reconciliation trail.
-- =============================================================================

create or replace function public.acct_trig_bank_line_matched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled    boolean;
  v_acct_name  text;
begin
  select is_enabled into v_enabled
  from public.feature_flags
  where key = 'acct.bridge.bank_recon' limit 1;

  if v_enabled is not true then
    return new;
  end if;

  -- Only fire when line transitions from unmatched → matched
  if (old.is_matched is distinct from new.is_matched) and new.is_matched = true then
    select account_name into v_acct_name
    from public.acct_bank_accounts where id = new.bank_account_id;

    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status,
      journal_entry_id, je_reference, je_description
    ) values (
      'acct_bank_statement_lines',
      new.id,
      'line_matched',
      'success',
      new.matched_journal_entry_id,
      null,
      format('Bank line matched — %s | %s %s | %s | JE: %s',
        coalesce(v_acct_name, 'Unknown Account'),
        new.amount, new.currency,
        new.statement_date,
        coalesce(new.matched_journal_entry_id::text, 'none'))
    );
  end if;

  -- Also fire on unmatch
  if (old.is_matched is distinct from new.is_matched) and new.is_matched = false
     and old.is_matched = true then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, je_description
    ) values (
      'acct_bank_statement_lines',
      new.id,
      'line_unmatched',
      'success',
      format('Bank line UN-matched — was linked to JE %s',
        coalesce(old.matched_journal_entry_id::text, 'none'))
    );
  end if;

  return new;
end;
$$;

-- =============================================================================
-- PART F: Phase 6 coverage view
-- =============================================================================

create or replace view public.v_acct_phase6_coverage as
select
  source_table,
  count(*)                                                              as total_events,
  count(*) filter (where status = 'success')                            as success_count,
  count(*) filter (where status = 'error')                              as error_count,
  count(*) filter (where status = 'skipped')                            as skipped_count,
  round(
    count(*) filter (where status = 'success')::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                                     as success_pct,
  max(created_at)                                                       as last_event_at,
  max(created_at) filter (where status = 'error')                       as last_error_at,
  case
    when count(*) = 0                                      then 'no_data'
    when count(*) filter (where status = 'error') > 0     then 'degraded'
    else 'healthy'
  end                                                                   as health_status
from public.acct_gl_bridge_log
where source_table in ('acct_bank_statement_lines')
group by source_table;

-- =============================================================================
-- PART G: Trigger binding — guarded with to_regclass
-- =============================================================================

do $guard_stmt$ begin
  if to_regclass('public.acct_bank_statement_lines') is not null then
    execute 'drop trigger if exists acct_bridge_bank_line_matched
             on public.acct_bank_statement_lines';
    execute 'create trigger acct_bridge_bank_line_matched
               after update on public.acct_bank_statement_lines
               for each row execute function public.acct_trig_bank_line_matched()';
    raise notice 'acct_bridge_bank_line_matched created on acct_bank_statement_lines.';
  else
    raise notice 'SKIP: acct_bank_statement_lines not found (should not happen in this script).';
  end if;
end $guard_stmt$;

-- =============================================================================
-- PART H: Feature flags
-- =============================================================================

insert into public.feature_flags (key, description, is_enabled) values
  ('acct.bridge.bank_recon',
   'Phase 6: Log GL bridge entry when a bank statement line is matched or un-matched to a journal entry. Enabled for audit trail.',
   true),
  ('acct.bank_recon.auto_suggest',
   'Phase 6: (Future) Auto-suggest journal entry matches for bank statement lines based on amount + date proximity. Disabled pending AI matching implementation.',
   false)
on conflict (key) do nothing;

-- =============================================================================
-- Summary
-- =============================================================================
-- Tables: acct_bank_accounts, acct_bank_statement_lines
-- Functions:
--   acct_bank_accounts_updated_at()  — updated_at trigger helper
--   acct_trig_bank_line_matched()    — GL bridge on match/unmatch
--   acct_bank_recon_summary(uuid?)   — per-bank recon stats RPC
-- Views: v_acct_phase6_coverage
-- Triggers:
--   trg_bank_accounts_updated_at     on acct_bank_accounts (BEFORE UPDATE)
--   acct_bridge_bank_line_matched    on acct_bank_statement_lines (AFTER UPDATE)
-- Feature flags:
--   acct.bridge.bank_recon           (true)
--   acct.bank_recon.auto_suggest     (false — future AI matching)
-- =============================================================================
