-- =============================================================================
-- PACT Accounting — Phase 8: Audit-Pack Export + External Auditor Portal
--
-- Creates:
--   acct_audit_packs         — audit pack headers (scope, status, access control)
--   acct_audit_pack_items    — JSONB snapshots of TB, journals, COA, bank recon, grants
--   acct_auditor_findings    — findings / queries raised by external auditors
--   acct_generate_audit_pack() — RPC: snapshot GL data into a new audit pack
--   acct_audit_pack_summary()  — RPC: pack metadata + item/finding counts
--   acct_trig_audit_pack_finalized() — GL bridge when pack status → finalized/shared
--   v_acct_phase8_coverage   — bridge health view
--   3 feature flags
--
-- Apply: any time after Phase 1.  Independent of Phases 4–7.
-- Idempotent: CREATE TABLE / INDEX / POLICY all guarded with IF NOT EXISTS.
-- Trigger functions use IF NOT EXISTS (SELECT 1 FROM feature_flags) — no DECLARE.
-- =============================================================================

-- ── PART A: Audit Packs ──────────────────────────────────────────────────────

create table if not exists public.acct_audit_packs (
  id               uuid        primary key default gen_random_uuid(),
  fiscal_year_id   uuid        not null references public.acct_fiscal_years(id) on delete restrict,
  title            text        not null,
  scope_notes      text,
  status           text        not null default 'draft'
    check (status in ('draft','generated','shared','finalized','archived')),
  -- Access
  shared_with      text[],           -- email addresses of external auditors
  access_token     text unique,      -- opaque token for portal URL
  expiry_date      date,             -- null = no expiry
  -- Lifecycle
  generated_at     timestamptz,
  generated_by     uuid        references auth.users(id),
  shared_at        timestamptz,
  finalized_at     timestamptz,
  finalized_by     uuid        references auth.users(id),
  -- Stats (denormalised for fast display)
  item_count       integer     not null default 0,
  finding_count    integer     not null default 0,
  open_finding_count integer   not null default 0,
  notes            text,
  created_by       uuid        references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_acct_ap_fiscal_year on public.acct_audit_packs (fiscal_year_id);
create index if not exists idx_acct_ap_status      on public.acct_audit_packs (status);
create index if not exists idx_acct_ap_token       on public.acct_audit_packs (access_token)
  where access_token is not null;

alter table public.acct_audit_packs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_audit_packs' and policyname = 'audit_packs_select'
  ) then
    execute 'create policy "audit_packs_select" on public.acct_audit_packs
             for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_audit_packs' and policyname = 'audit_packs_modify'
  ) then
    execute $pol$create policy "audit_packs_modify" on public.acct_audit_packs
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in (
              'super_admin','admin','financialAdmin',
              'financial_admin','accountant','finance'
            )
        )
      )$pol$;
  end if;
end $$;

-- updated_at trigger
create or replace function public.update_acct_audit_packs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists acct_audit_packs_updated_at on public.acct_audit_packs;
create trigger acct_audit_packs_updated_at
  before update on public.acct_audit_packs
  for each row execute function public.update_acct_audit_packs_updated_at();

-- ── PART B: Audit Pack Items ─────────────────────────────────────────────────
-- Each item is a named JSONB snapshot of one data domain within the pack.

create table if not exists public.acct_audit_pack_items (
  id           uuid        primary key default gen_random_uuid(),
  pack_id      uuid        not null references public.acct_audit_packs(id) on delete cascade,
  item_type    text        not null
    check (item_type in (
      'trial_balance',
      'journal_summary',
      'coa_snapshot',
      'period_summary',
      'bank_recon_summary',
      'grant_utilization',
      'statutory_summary',
      'custom'
    )),
  item_label   text        not null,
  item_data    jsonb       not null default '{}',
  row_count    integer,            -- how many records are in item_data
  generated_at timestamptz not null default now(),
  notes        text
);

create index if not exists idx_acct_api_pack   on public.acct_audit_pack_items (pack_id);
create index if not exists idx_acct_api_type   on public.acct_audit_pack_items (item_type);
create index if not exists idx_acct_api_data   on public.acct_audit_pack_items using gin (item_data);

alter table public.acct_audit_pack_items enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_audit_pack_items' and policyname = 'audit_pack_items_select'
  ) then
    execute 'create policy "audit_pack_items_select" on public.acct_audit_pack_items
             for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_audit_pack_items' and policyname = 'audit_pack_items_modify'
  ) then
    execute $pol$create policy "audit_pack_items_modify" on public.acct_audit_pack_items
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in (
              'super_admin','admin','financialAdmin',
              'financial_admin','accountant','finance'
            )
        )
      )$pol$;
  end if;
end $$;

-- ── PART C: Auditor Findings ─────────────────────────────────────────────────
-- Findings, queries, and observations raised by external auditors.

create table if not exists public.acct_auditor_findings (
  id               uuid        primary key default gen_random_uuid(),
  pack_id          uuid        not null references public.acct_audit_packs(id) on delete cascade,
  finding_type     text        not null default 'query'
    check (finding_type in (
      'query','observation','recommendation',
      'material_misstatement','minor_issue'
    )),
  reference_code   text,            -- e.g. "F-001"
  description      text        not null,
  period_reference text,            -- e.g. "Jan 2024"
  account_reference text,           -- e.g. "5110 Salary Expense"
  raised_by        text,            -- external auditor name
  raised_at        timestamptz not null default now(),
  status           text        not null default 'open'
    check (status in ('open','under_review','responded','closed','not_applicable')),
  priority         text        not null default 'medium'
    check (priority in ('low','medium','high','critical')),
  response_text    text,
  responded_by     uuid        references auth.users(id),
  responded_at     timestamptz,
  closed_at        timestamptz,
  closed_by        uuid        references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_acct_af_pack   on public.acct_auditor_findings (pack_id);
create index if not exists idx_acct_af_status on public.acct_auditor_findings (status);
create index if not exists idx_acct_af_type   on public.acct_auditor_findings (finding_type);

alter table public.acct_auditor_findings enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_auditor_findings' and policyname = 'auditor_findings_select'
  ) then
    execute 'create policy "auditor_findings_select" on public.acct_auditor_findings
             for select to authenticated using (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'acct_auditor_findings' and policyname = 'auditor_findings_modify'
  ) then
    execute $pol$create policy "auditor_findings_modify" on public.acct_auditor_findings
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles
          where profiles.id = auth.uid()
            and profiles.role in (
              'super_admin','admin','financialAdmin',
              'financial_admin','accountant','finance'
            )
        )
      )$pol$;
  end if;
end $$;

-- updated_at trigger
create or replace function public.update_acct_auditor_findings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists acct_auditor_findings_updated_at on public.acct_auditor_findings;
create trigger acct_auditor_findings_updated_at
  before update on public.acct_auditor_findings
  for each row execute function public.update_acct_auditor_findings_updated_at();

-- ── PART D: acct_generate_audit_pack() RPC ───────────────────────────────────
-- Creates an audit pack and snapshots key GL data into acct_audit_pack_items.
-- Uses := assignment (not SELECT INTO) to avoid parser ambiguity.
-- Returns the new pack id.

create or replace function public.acct_generate_audit_pack(
  p_fiscal_year_id uuid,
  p_title          text    default null,
  p_scope_notes    text    default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pack_id   uuid    := gen_random_uuid();
  v_fy_name   text;
  v_fy_start  date;
  v_fy_end    date;
  v_item_cnt  integer := 0;
begin
  -- Resolve fiscal year metadata
  v_fy_name  := (select code        from public.acct_fiscal_years where id = p_fiscal_year_id);
  v_fy_start := (select start_date from public.acct_fiscal_years where id = p_fiscal_year_id);
  v_fy_end   := (select end_date   from public.acct_fiscal_years where id = p_fiscal_year_id);

  if v_fy_name is null then
    raise exception 'Fiscal year % not found', p_fiscal_year_id;
  end if;

  -- Create the pack header
  insert into public.acct_audit_packs (
    id, fiscal_year_id, title, scope_notes, status,
    access_token, generated_at, generated_by, created_by
  ) values (
    v_pack_id,
    p_fiscal_year_id,
    coalesce(p_title, 'Audit Pack — ' || v_fy_name),
    p_scope_notes,
    'generated',
    encode(gen_random_bytes(24), 'hex'),
    now(),
    auth.uid(),
    auth.uid()
  );

  -- ── Item 1: Journal entry summary ─────────────────────────────────────────
  insert into public.acct_audit_pack_items
    (pack_id, item_type, item_label, item_data, row_count)
  select
    v_pack_id,
    'journal_summary',
    'Journal Entries — ' || v_fy_name,
    jsonb_build_object(
      'fiscal_year',     v_fy_name,
      'total_entries',   count(*),
      'posted_entries',  count(*) filter (where je.status = 'posted'),
      'draft_entries',   count(*) filter (where je.status = 'draft'),
      'total_debit',     coalesce(sum(je.total_debit), 0),
      'total_credit',    coalesce(sum(je.total_credit), 0),
      'generated_at',    now()
    ),
    count(*)::integer
  from public.acct_journal_entries je
  where je.entry_date between v_fy_start and v_fy_end;

  v_item_cnt := v_item_cnt + 1;

  -- ── Item 2: Trial balance snapshot ────────────────────────────────────────
  insert into public.acct_audit_pack_items
    (pack_id, item_type, item_label, item_data, row_count)
  select
    v_pack_id,
    'trial_balance',
    'Trial Balance — ' || v_fy_name,
    jsonb_agg(
      jsonb_build_object(
        'account_code',  a.code,
        'account_name',  a.name,
        'account_type',  a.account_type,
        'total_debit',   coalesce(sum(jl.debit_amount),  0),
        'total_credit',  coalesce(sum(jl.credit_amount), 0),
        'balance',       coalesce(sum(jl.debit_amount),0)
                         - coalesce(sum(jl.credit_amount),0)
      ) order by a.code
    ),
    count(distinct a.id)::integer
  from public.acct_accounts a
  left join public.acct_journal_lines jl on jl.account_id = a.id
  left join public.acct_journal_entries je on je.id = jl.journal_entry_id
    and je.entry_date between v_fy_start and v_fy_end
    and je.status = 'posted'
  group by ()   -- single row with full aggregation
  having count(distinct a.id) > 0;

  v_item_cnt := v_item_cnt + 1;

  -- ── Item 3: Chart of Accounts snapshot ────────────────────────────────────
  insert into public.acct_audit_pack_items
    (pack_id, item_type, item_label, item_data, row_count)
  select
    v_pack_id,
    'coa_snapshot',
    'Chart of Accounts — ' || v_fy_name,
    jsonb_agg(
      jsonb_build_object(
        'code',         a.code,
        'name',         a.name,
        'account_type', a.account_type,
        'is_active',    a.is_active
      ) order by a.code
    ),
    count(*)::integer
  from public.acct_accounts a
  where a.is_active = true;

  v_item_cnt := v_item_cnt + 1;

  -- ── Item 4: Period summary ─────────────────────────────────────────────────
  insert into public.acct_audit_pack_items
    (pack_id, item_type, item_label, item_data, row_count)
  select
    v_pack_id,
    'period_summary',
    'Fiscal Periods — ' || v_fy_name,
    jsonb_agg(
      jsonb_build_object(
        'period_no',   fp.period_no,
        'start_date',  fp.start_date,
        'end_date',    fp.end_date,
        'status',      fp.status,
        'closed_at',   fp.closed_at
      ) order by fp.period_no
    ),
    count(*)::integer
  from public.acct_fiscal_periods fp
  where fp.fiscal_year_id = p_fiscal_year_id;

  v_item_cnt := v_item_cnt + 1;

  -- ── Item 5: Bank recon summary (if tables exist) ───────────────────────────
  if to_regclass('public.acct_bank_statement_lines') is not null then
    insert into public.acct_audit_pack_items
      (pack_id, item_type, item_label, item_data, row_count)
    select
      v_pack_id,
      'bank_recon_summary',
      'Bank Reconciliation Summary — ' || v_fy_name,
      jsonb_agg(
        jsonb_build_object(
          'bank_account',  b.account_name,
          'bank_name',     b.bank_name,
          'currency',      b.currency,
          'total_lines',   count(s.id),
          'matched',       count(s.id) filter (where s.is_matched),
          'unmatched',     count(s.id) filter (where not s.is_matched and not s.is_excluded),
          'match_rate_pct',
            case when count(s.id) > 0
                 then round(count(s.id) filter (where s.is_matched)::numeric/count(s.id)*100,1)
                 else 0 end
        ) order by b.account_name
      ),
      count(distinct b.id)::integer
    from public.acct_bank_accounts b
    left join public.acct_bank_statement_lines s
      on s.bank_account_id = b.id
      and s.statement_date between v_fy_start and v_fy_end
    group by ();

    v_item_cnt := v_item_cnt + 1;
  end if;

  -- ── Item 6: Grant utilization (if tables exist) ────────────────────────────
  if to_regclass('public.acct_grants') is not null then
    insert into public.acct_audit_pack_items
      (pack_id, item_type, item_label, item_data, row_count)
    select
      v_pack_id,
      'grant_utilization',
      'Grant Utilization — ' || v_fy_name,
      jsonb_agg(
        jsonb_build_object(
          'grant_name',       g.name,
          'donor',            g.donor_name,
          'budget',           g.total_budget,
          'currency',         g.currency,
          'status',           g.status,
          'start_date',       g.start_date,
          'end_date',         g.end_date
        ) order by g.name
      ),
      count(*)::integer
    from public.acct_grants g
    where g.start_date <= v_fy_end
      and (g.end_date is null or g.end_date >= v_fy_start);

    v_item_cnt := v_item_cnt + 1;
  end if;

  -- Update item count on the pack
  update public.acct_audit_packs
  set item_count = v_item_cnt
  where id = v_pack_id;

  return v_pack_id;
end;
$$;

-- ── PART E: acct_audit_pack_summary() RPC ────────────────────────────────────
-- Returns pack header + item types present + finding counts by status.

create or replace function public.acct_audit_pack_summary(
  p_pack_id uuid
)
returns table (
  pack_id          uuid,
  title            text,
  fiscal_year_name text,
  status           text,
  item_count       integer,
  finding_count    integer,
  open_findings    bigint,
  critical_findings bigint,
  item_types       text[],
  generated_at     timestamptz,
  expiry_date      date,
  shared_with      text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    fy.code                                                    as fiscal_year_name,
    p.status,
    p.item_count,
    p.finding_count,
    count(f.id) filter (where f.status = 'open')               as open_findings,
    count(f.id) filter (where f.priority = 'critical')         as critical_findings,
    array(
      select distinct i.item_type
      from public.acct_audit_pack_items i
      where i.pack_id = p.id
      order by 1
    )                                                          as item_types,
    p.generated_at,
    p.expiry_date,
    p.shared_with
  from public.acct_audit_packs p
  join public.acct_fiscal_years fy on fy.id = p.fiscal_year_id
  left join public.acct_auditor_findings f on f.pack_id = p.id
  where p.id = p_pack_id
  group by p.id, p.title, fy.code, p.status, p.item_count,
           p.finding_count, p.generated_at, p.expiry_date, p.shared_with;
$$;

-- ── PART F: GL Bridge trigger ─────────────────────────────────────────────────
-- Fires when an audit pack moves to 'finalized' or 'shared'.
-- Uses EXISTS feature-flag check (no DECLARE/SELECT INTO).

create or replace function public.acct_trig_audit_pack_finalized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.feature_flags
    where key = 'acct.bridge.audit_pack' and is_enabled = true
  ) then
    return new;
  end if;

  if (old.status is distinct from new.status)
     and new.status in ('finalized', 'shared') then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, je_description
    ) values (
      'acct_audit_packs',
      new.id,
      'audit_pack_' || new.status,
      'success',
      format('Audit pack %s — title: %s | items: %s | findings: %s | by: %s',
        new.status,
        new.title,
        new.item_count,
        new.finding_count,
        coalesce(auth.uid()::text, 'system'))
    );
  end if;

  return new;
end;
$$;

-- ── PART G: Finding counter maintenance trigger ────────────────────────────────
-- Keeps acct_audit_packs.finding_count + open_finding_count in sync.

create or replace function public.acct_trig_finding_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_id uuid;
begin
  v_pack_id := coalesce(new.pack_id, old.pack_id);

  update public.acct_audit_packs
  set
    finding_count      = (select count(*) from public.acct_auditor_findings where pack_id = v_pack_id),
    open_finding_count = (select count(*) from public.acct_auditor_findings where pack_id = v_pack_id and status = 'open'),
    updated_at         = now()
  where id = v_pack_id;

  return coalesce(new, old);
end;
$$;

-- ── PART H: Coverage view ─────────────────────────────────────────────────────

create or replace view public.v_acct_phase8_coverage as
select
  source_table,
  count(*)                                                              as total_events,
  count(*) filter (where status = 'success')                            as success_count,
  count(*) filter (where status = 'error')                              as error_count,
  count(*) filter (where status = 'skipped')                            as skipped_count,
  round(count(*) filter (where status='success')::numeric
        / nullif(count(*),0)*100, 1)                                    as success_pct,
  max(created_at)                                                       as last_event_at,
  max(created_at) filter (where status = 'error')                       as last_error_at,
  case
    when count(*) = 0                                  then 'no_data'
    when count(*) filter (where status='error') > 0    then 'degraded'
    else 'healthy'
  end                                                                   as health_status
from public.acct_gl_bridge_log
where source_table in ('acct_audit_packs','acct_auditor_findings')
group by source_table;

-- ── PART I: Trigger bindings ──────────────────────────────────────────────────

do $guard$ begin
  if to_regclass('public.acct_audit_packs') is not null then
    execute 'drop trigger if exists acct_bridge_audit_pack_finalized
             on public.acct_audit_packs';
    execute 'create trigger acct_bridge_audit_pack_finalized
               after update on public.acct_audit_packs
               for each row
               execute function public.acct_trig_audit_pack_finalized()';
    raise notice 'acct_bridge_audit_pack_finalized created on acct_audit_packs.';
  end if;
end $guard$;

do $guard2$ begin
  if to_regclass('public.acct_auditor_findings') is not null then
    execute 'drop trigger if exists acct_finding_counter_ins
             on public.acct_auditor_findings';
    execute 'drop trigger if exists acct_finding_counter_upd
             on public.acct_auditor_findings';
    execute 'drop trigger if exists acct_finding_counter_del
             on public.acct_auditor_findings';
    execute 'create trigger acct_finding_counter_ins
               after insert on public.acct_auditor_findings
               for each row execute function public.acct_trig_finding_counter()';
    execute 'create trigger acct_finding_counter_upd
               after update on public.acct_auditor_findings
               for each row execute function public.acct_trig_finding_counter()';
    execute 'create trigger acct_finding_counter_del
               after delete on public.acct_auditor_findings
               for each row execute function public.acct_trig_finding_counter()';
    raise notice 'acct_finding_counter triggers created on acct_auditor_findings.';
  end if;
end $guard2$;

-- ── PART J: Feature flags ──────────────────────────────────────────────────────

insert into public.feature_flags (key, description, is_enabled) values
  ('acct.audit_pack.enabled',
   'Phase 8: Enable audit pack generation (snapshots TB, journals, COA, bank recon, grants into a JSONB bundle for external auditors).',
   true),
  ('acct.auditor_portal.enabled',
   'Phase 8: Enable external auditor portal — time-limited token access to view shared audit packs and raise findings.',
   false),
  ('acct.bridge.audit_pack',
   'Phase 8: Log GL bridge entry when an audit pack is finalized or shared with external auditors.',
   true)
on conflict (key) do nothing;

-- ── PART K: Smoke checks ──────────────────────────────────────────────────────

select count(*) as audit_pack_tables_ok
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'acct_audit_packs','acct_audit_pack_items','acct_auditor_findings'
  );
-- expect 3

select count(*) as phase8_flags
from public.feature_flags
where key in (
  'acct.audit_pack.enabled',
  'acct.auditor_portal.enabled',
  'acct.bridge.audit_pack'
);
-- expect 3

select tgname from pg_trigger
where tgname in (
  'acct_bridge_audit_pack_finalized',
  'acct_finding_counter_ins',
  'acct_finding_counter_upd',
  'acct_finding_counter_del'
);
-- expect 4 rows

select 'Phase 8 audit pack SQL complete.' as result;
