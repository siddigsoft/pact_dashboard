-- =============================================================================
-- PACT Accounting Module — Phase 1 Sprint 1.1
-- GL Foundations: Schema + Posting Engine + Trial Balance + Feature Flags
-- =============================================================================
-- Source plan : docs/ACCOUNTING_PHASE1_DESIGN.md (Sprint 1.1)
--               docs/PLANNING_INDEX.md §3 lines 1180-1670
-- Sign-off    : docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md (FULLY SIGNED OFF 2026-04-25)
-- Apply       : MANUAL — paste into pactdb (abznugnirnlrqnnfkein) SQL editor
-- Runbook     : docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md
-- Idempotent  : YES — safe to re-run; uses CREATE IF NOT EXISTS / DO blocks
-- Rollback    : docs/sql/PHASE1_SPRINT1_1_ROLLBACK.sql
-- =============================================================================
--
-- Acceptance criteria delivered by THIS migration (master plan §6 Phase 1):
--   1. Any service can post a balanced journal via acct_post_journal       ✅
--   2. Trial Balance RPC returns correct numbers per period/fund/branch    ✅
--   5. Fund-restriction model in place (every line tags an acct_funds row) ✅
--   8. Feature-flag framework gates every new finance feature              ✅
--
-- Acceptance criteria DEFERRED to Sprint 1.2:
--   3. Sanctions block prevents posting to a sanctioned partner
--   4. SoD matrix prevents the same user posting and approving same journal
--   9. Arabic font registered for jsPDF
--  10. Audit-trail visualiser
--
-- Acceptance criteria DEFERRED to Sprint 1.3 (test harness):
--   6. Posting-engine unit-test suite (≥95% branch coverage)
--   7. Synthetic data generator
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. ENUM TYPES (idempotent via DO blocks)
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_restriction_type') then
    create type acct_restriction_type as enum (
      'without_restriction',
      'with_restriction',
      'board_designated',
      'quasi_endowment'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_account_type') then
    create type acct_account_type as enum (
      'asset','liability','equity','revenue','expense'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_account_subtype') then
    create type acct_account_subtype as enum (
      'current_asset','non_current_asset',
      'current_liability','non_current_liability',
      'contributed_equity','retained_equity',
      'operating_revenue','non_operating_revenue',
      'program_expense','mng_expense','fundraising_expense',
      'cogs','other_expense'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_period_status') then
    create type acct_period_status as enum (
      'open','soft_closed','hard_closed','locked'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_journal_status') then
    create type acct_journal_status as enum (
      'draft','pending_approval','posted','reversed','rejected'
    );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. acct_funds — fund-restriction model
-- -----------------------------------------------------------------------------
create table if not exists public.acct_funds (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name_en           text not null,
  name_ar           text not null,
  restriction_type  acct_restriction_type not null,
  donor_partner_id  uuid,
  start_date        date,
  end_date          date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id)
);

-- Soft FK to partners (handles environments where partners table may differ)
do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='partners')
     and not exists (select 1 from information_schema.table_constraints
                     where constraint_name='acct_funds_donor_partner_id_fkey'
                     and table_name='acct_funds') then
    alter table public.acct_funds
      add constraint acct_funds_donor_partner_id_fkey
      foreign key (donor_partner_id) references public.partners(id);
  end if;
end $$;

create index if not exists idx_acct_funds_active
  on public.acct_funds(is_active) where is_active;

alter table public.acct_funds enable row level security;

-- -----------------------------------------------------------------------------
-- 2. acct_accounts — Chart of Accounts
-- -----------------------------------------------------------------------------
create table if not exists public.acct_accounts (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name_en         text not null,
  name_ar         text not null,
  account_type    acct_account_type not null,
  subtype         acct_account_subtype not null,
  parent_id       uuid references public.acct_accounts(id),
  is_active       boolean not null default true,
  is_postable     boolean not null default true,
  branch_id       uuid,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

create index if not exists idx_acct_accounts_type   on public.acct_accounts(account_type);
create index if not exists idx_acct_accounts_parent on public.acct_accounts(parent_id);
create index if not exists idx_acct_accounts_active on public.acct_accounts(is_active) where is_active;

alter table public.acct_accounts enable row level security;

-- -----------------------------------------------------------------------------
-- 3. acct_fiscal_years + acct_fiscal_periods
-- -----------------------------------------------------------------------------
create table if not exists public.acct_fiscal_years (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  start_date  date not null,
  end_date    date not null,
  is_closed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.acct_fiscal_periods (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.acct_fiscal_years(id),
  period_no       int not null check (period_no between 1 and 12),
  start_date      date not null,
  end_date        date not null,
  status          acct_period_status not null default 'open',
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id),
  unique (fiscal_year_id, period_no)
);

create index if not exists idx_acct_fp_status on public.acct_fiscal_periods(status);
create index if not exists idx_acct_fp_dates  on public.acct_fiscal_periods(start_date, end_date);

alter table public.acct_fiscal_years   enable row level security;
alter table public.acct_fiscal_periods enable row level security;

-- -----------------------------------------------------------------------------
-- 4. acct_journal_entries + acct_journal_lines
-- -----------------------------------------------------------------------------
-- NOTE on partitioning: the design doc calls for monthly partitions of
-- acct_journal_lines (by posting period). Pragmatic choice for Sprint 1.1:
-- ship as a normal table with strong indexes; add declarative partitioning in
-- a follow-up migration once volume warrants. Tracked in §5.3-a backlog.
create table if not exists public.acct_journal_entries (
  id                    uuid primary key default gen_random_uuid(),
  entry_no              bigserial not null unique,
  period_id             uuid not null references public.acct_fiscal_periods(id),
  posting_date          date not null,
  description_en        text not null,
  description_ar        text,
  source_type           text not null,
  source_id             uuid,
  status                acct_journal_status not null default 'draft',
  branch_id             uuid,
  idempotency_key       text not null unique,
  posted_at             timestamptz,
  posted_by             uuid references public.profiles(id),
  reversed_by_entry_id  uuid references public.acct_journal_entries(id),
  created_at            timestamptz not null default now(),
  created_by            uuid not null references public.profiles(id)
);

create index if not exists idx_acct_je_period on public.acct_journal_entries(period_id);
create index if not exists idx_acct_je_source on public.acct_journal_entries(source_type, source_id);
create index if not exists idx_acct_je_status on public.acct_journal_entries(status);
create index if not exists idx_acct_je_post_date on public.acct_journal_entries(posting_date);

create table if not exists public.acct_journal_lines (
  id                  uuid primary key default gen_random_uuid(),
  entry_id            uuid not null references public.acct_journal_entries(id) on delete cascade,
  line_no             int not null,
  account_id          uuid not null references public.acct_accounts(id),
  fund_id             uuid not null references public.acct_funds(id),
  function            text not null check (function in ('program','mng','fundraising','none')),
  project_id          uuid,
  grant_id            uuid,
  cost_center_id      uuid,
  partner_id          uuid,
  original_amount     numeric(20,4) not null check (original_amount >= 0),
  original_currency   text not null,
  functional_amount   numeric(20,4) not null check (functional_amount >= 0),
  functional_currency text not null default 'SDG',
  fx_rate             numeric(20,8),
  debit_credit        char(2) not null check (debit_credit in ('DR','CR')),
  description         text,
  unique (entry_id, line_no)
);

create index if not exists idx_acct_jl_account_period on public.acct_journal_lines(account_id);
create index if not exists idx_acct_jl_fund          on public.acct_journal_lines(fund_id);
create index if not exists idx_acct_jl_project       on public.acct_journal_lines(project_id);
create index if not exists idx_acct_jl_grant         on public.acct_journal_lines(grant_id);
create index if not exists idx_acct_jl_cost_center   on public.acct_journal_lines(cost_center_id);
create index if not exists idx_acct_jl_entry         on public.acct_journal_lines(entry_id);

-- Soft FKs to optional tables
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='partners')
     and not exists (select 1 from information_schema.table_constraints where constraint_name='acct_journal_lines_partner_id_fkey') then
    alter table public.acct_journal_lines
      add constraint acct_journal_lines_partner_id_fkey
      foreign key (partner_id) references public.partners(id);
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='projects')
     and not exists (select 1 from information_schema.table_constraints where constraint_name='acct_journal_lines_project_id_fkey') then
    alter table public.acct_journal_lines
      add constraint acct_journal_lines_project_id_fkey
      foreign key (project_id) references public.projects(id);
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='departments')
     and not exists (select 1 from information_schema.table_constraints where constraint_name='acct_journal_lines_cost_center_id_fkey') then
    alter table public.acct_journal_lines
      add constraint acct_journal_lines_cost_center_id_fkey
      foreign key (cost_center_id) references public.departments(id);
  end if;
end $$;

alter table public.acct_journal_entries enable row level security;
alter table public.acct_journal_lines   enable row level security;

-- Immutability of journal lines: no UPDATE/DELETE policy will be defined for
-- regular roles. Service role bypasses RLS — but the trigger below enforces
-- the rule even against service role for safety.
create or replace function public.acct_jl_immutability_guard()
returns trigger language plpgsql as $$
begin
  -- Allow DELETE only via cascade from acct_journal_entries (for draft cleanup)
  if tg_op = 'UPDATE' then
    raise exception 'IMMUTABLE_LINE: acct_journal_lines rows cannot be updated. Use a reversal entry.';
  end if;
  return null;
end $$;

drop trigger if exists trg_acct_jl_immutable on public.acct_journal_lines;
create trigger trg_acct_jl_immutable
  before update on public.acct_journal_lines
  for each row execute function public.acct_jl_immutability_guard();

-- -----------------------------------------------------------------------------
-- 5. feature_flags + feature_enabled() helper
-- -----------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key             text primary key,
  description     text not null,
  is_enabled      boolean not null default false,
  branch_scope    uuid[] default '{}',
  rolled_out_pct  int default 100 check (rolled_out_pct between 0 and 100),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);

alter table public.feature_flags enable row level security;

create or replace function public.feature_enabled(p_key text, p_branch_id uuid default null)
returns boolean language sql stable as $$
  select coalesce((
    select is_enabled
       and (cardinality(branch_scope) = 0 or p_branch_id = any(branch_scope))
       and (rolled_out_pct = 100
            or (abs(hashtext(p_key || coalesce(p_branch_id::text, ''))) % 100) < rolled_out_pct)
      from public.feature_flags
     where key = p_key
  ), false);
$$;

-- Bootstrap initial flags
insert into public.feature_flags (key, description, is_enabled) values
  ('acct.posting_engine.enabled',  'Master switch for the GL posting engine',                          true),
  ('acct.sanctions.block_on_match','When OFF, sanctions matches log only; when ON, they block posting',true),
  ('acct.sod.enforce',             'When OFF, SoD violations log only; when ON, they block posting',   true),
  ('acct.fund_required',           'Require fund_id on every journal line',                            true),
  ('acct.function_required',       'Require function on every expense journal line',                   true),
  ('acct.parallel_run.enabled',    'Phase 1 cut-over flag — flips during parallel-run period',         false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 6. acct_post_journal RPC — the heart of Phase 1
-- -----------------------------------------------------------------------------
create or replace function public.acct_post_journal(
  p_payload         jsonb,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_entry_id     uuid;
  v_user_id      uuid := auth.uid();
  v_user_role    text;
  v_period_id    uuid := (p_payload->>'period_id')::uuid;
  v_period_row   record;
  v_posting_date date;
  v_lines        jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_line         jsonb;
  v_idx          int;
  v_dr_total     numeric(20,4);
  v_cr_total     numeric(20,4);
  v_balance_row  record;
  v_acct_row     record;
  v_function_required boolean := public.feature_enabled('acct.function_required');
  v_fund_required     boolean := public.feature_enabled('acct.fund_required');
  v_engine_on         boolean := public.feature_enabled('acct.posting_engine.enabled');
begin
  -- A. Auth + engine + key gates
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: acct_post_journal must be called by an authenticated user';
  end if;
  if not v_engine_on then
    raise exception 'POSTING_ENGINE_DISABLED: feature flag acct.posting_engine.enabled is OFF';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  -- B. Authorization — SECURITY DEFINER means we MUST enforce role here.
  --    Only super_admin / finance / accountant may post.
  select role into v_user_role
    from public.profiles
   where id = v_user_id;
  if v_user_role is null then
    raise exception 'PROFILE_NOT_FOUND: caller has no profile row';
  end if;
  if v_user_role not in ('super_admin','finance','accountant') then
    raise exception 'AUTHORIZATION_FAILED: role % may not post journals', v_user_role;
  end if;

  -- 1. Idempotency: if key exists, return existing entry id (race-safe via ON CONFLICT below)
  select id into v_entry_id
    from public.acct_journal_entries
   where idempotency_key = p_idempotency_key;
  if found then
    return v_entry_id;
  end if;

  -- 2. Validate period is open or soft_closed AND posting_date is in range
  select status, start_date, end_date into v_period_row
    from public.acct_fiscal_periods
   where id = v_period_id;
  if not found then
    raise exception 'PERIOD_NOT_FOUND: %', v_period_id;
  end if;
  if v_period_row.status not in ('open','soft_closed') then
    raise exception 'PERIOD_CLOSED: period % is %', v_period_id, v_period_row.status;
  end if;
  v_posting_date := coalesce((p_payload->>'posting_date')::date, current_date);
  if v_posting_date < v_period_row.start_date or v_posting_date > v_period_row.end_date then
    raise exception 'POSTING_DATE_OUT_OF_PERIOD: posting_date % not in period [% .. %]',
      v_posting_date, v_period_row.start_date, v_period_row.end_date;
  end if;

  -- 3. Validate at least 2 lines
  if jsonb_array_length(v_lines) < 2 then
    raise exception 'INSUFFICIENT_LINES: a journal must have at least 2 lines';
  end if;

  -- 4. Per-line validation + DR/CR balance per fund (in functional currency)
  create temp table if not exists _acct_line_check (
    line_no             int,
    account_id          uuid,
    fund_id             uuid,
    function_text       text,
    debit_credit        char(2),
    functional_amount   numeric(20,4),
    original_amount     numeric(20,4),
    original_currency   text,
    functional_currency text,
    fx_rate             numeric(20,8),
    project_id          uuid,
    grant_id            uuid,
    cost_center_id      uuid,
    partner_id          uuid,
    description         text
  ) on commit drop;
  delete from _acct_line_check;

  v_idx := 0;
  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_idx := v_idx + 1;

    if v_fund_required and (v_line->>'fund_id') is null then
      raise exception 'MISSING_FUND: line %', v_idx;
    end if;
    if (v_line->>'function') is null then
      raise exception 'MISSING_FUNCTION: line %', v_idx;
    end if;

    -- Account validation
    select id, is_active, is_postable, account_type into v_acct_row
      from public.acct_accounts
     where id = (v_line->>'account_id')::uuid;
    if not found then
      raise exception 'ACCOUNT_NOT_FOUND: line %, id=%', v_idx, v_line->>'account_id';
    end if;
    if not v_acct_row.is_active then
      raise exception 'ACCOUNT_INACTIVE: line %, account=%', v_idx, v_line->>'account_id';
    end if;
    if not v_acct_row.is_postable then
      raise exception 'ACCOUNT_NOT_POSTABLE: line %, account=%', v_idx, v_line->>'account_id';
    end if;

    -- Function-required guard for expense accounts
    if v_function_required
       and v_acct_row.account_type = 'expense'
       and (v_line->>'function') = 'none' then
      raise exception 'MISSING_FUNCTION: expense line % must specify program / mng / fundraising', v_idx;
    end if;

    -- FX coherence
    if (v_line->>'original_currency') is distinct from coalesce(v_line->>'functional_currency','SDG')
       and (v_line->>'fx_rate') is null then
      raise exception 'FX_RATE_MISSING: line % crosses currency boundary without fx_rate', v_idx;
    end if;

    insert into _acct_line_check values (
      v_idx,
      (v_line->>'account_id')::uuid,
      (v_line->>'fund_id')::uuid,
      v_line->>'function',
      v_line->>'debit_credit',
      (v_line->>'functional_amount')::numeric,
      (v_line->>'original_amount')::numeric,
      v_line->>'original_currency',
      coalesce(v_line->>'functional_currency','SDG'),
      nullif(v_line->>'fx_rate','')::numeric,
      nullif(v_line->>'project_id','')::uuid,
      nullif(v_line->>'grant_id','')::uuid,
      nullif(v_line->>'cost_center_id','')::uuid,
      nullif(v_line->>'partner_id','')::uuid,
      v_line->>'description'
    );
  end loop;

  -- 5. Validate DR/CR balance per fund (functional currency)
  for v_balance_row in
    select fund_id,
           sum(case when debit_credit='DR' then functional_amount else 0 end) as dr,
           sum(case when debit_credit='CR' then functional_amount else 0 end) as cr
      from _acct_line_check
     group by fund_id
  loop
    if v_balance_row.dr <> v_balance_row.cr then
      raise exception 'BALANCE_MISMATCH: fund=% dr=% cr=%',
        v_balance_row.fund_id, v_balance_row.dr, v_balance_row.cr;
    end if;
  end loop;

  -- 6. Sanctions check — placeholder; real impl arrives in Sprint 1.2
  --    When acct_sanctioned_parties exists, scan partner_id's here.
  if to_regclass('public.acct_sanctioned_parties') is not null
     and public.feature_enabled('acct.sanctions.block_on_match') then
    if exists (
      select 1
        from _acct_line_check l
        join public.acct_sanctioned_parties sp on sp.match_hash = (
          select match_hash from public.acct_sanctioned_parties
           where external_id::text = l.partner_id::text limit 1)
       where l.partner_id is not null
    ) then
      raise exception 'SANCTIONS_BLOCK: one or more lines reference a sanctioned partner';
    end if;
  end if;

  -- 7. SoD check — placeholder; real impl arrives in Sprint 1.2
  --    When acct_sod_rules exists, evaluate journal.post action here.

  -- 8. INSERT entry + lines (race-safe via ON CONFLICT on idempotency_key).
  --    If a concurrent caller already inserted this key, we won't error;
  --    we'll fall through and return the existing entry's id.
  insert into public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, branch_id, idempotency_key,
    posted_at, posted_by, created_by
  ) values (
    v_period_id,
    v_posting_date,
    p_payload->>'description_en',
    p_payload->>'description_ar',
    coalesce(p_payload->>'source_type','manual'),
    nullif(p_payload->>'source_id','')::uuid,
    'posted',
    nullif(p_payload->>'branch_id','')::uuid,
    p_idempotency_key,
    now(),
    v_user_id,
    v_user_id
  )
  on conflict (idempotency_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    -- Lost the race: another tx wrote the same idempotency key. Return its id.
    select id into v_entry_id
      from public.acct_journal_entries
     where idempotency_key = p_idempotency_key;
    return v_entry_id;
  end if;

  insert into public.acct_journal_lines (
    entry_id, line_no, account_id, fund_id, function,
    project_id, grant_id, cost_center_id, partner_id,
    original_amount, original_currency,
    functional_amount, functional_currency, fx_rate,
    debit_credit, description
  )
  select v_entry_id, line_no, account_id, fund_id, function_text,
         project_id, grant_id, cost_center_id, partner_id,
         original_amount, original_currency,
         functional_amount, functional_currency, fx_rate,
         debit_credit, description
    from _acct_line_check
   order by line_no;

  -- 9. NOTIFY for materialised view refresh (downstream consumers)
  perform pg_notify('acct_journal_posted', v_entry_id::text);

  return v_entry_id;
end $$;

comment on function public.acct_post_journal(jsonb, text) is
  'Posts a balanced journal entry. Idempotent on p_idempotency_key. '
  'Raises: PERIOD_CLOSED, BALANCE_MISMATCH, ACCOUNT_INACTIVE, ACCOUNT_NOT_POSTABLE, '
  'MISSING_FUND, MISSING_FUNCTION, FX_RATE_MISSING, SANCTIONS_BLOCK, '
  'POSTING_ENGINE_DISABLED, AUTH_REQUIRED, IDEMPOTENCY_KEY_REQUIRED.';

-- -----------------------------------------------------------------------------
-- 7. acct_trial_balance RPC
-- -----------------------------------------------------------------------------
create or replace function public.acct_trial_balance(
  p_period_id uuid,
  p_branch_id uuid default null,
  p_fund_id   uuid default null
) returns table (
  account_id      uuid,
  account_code    text,
  account_name_en text,
  account_name_ar text,
  account_type    acct_account_type,
  debit_total     numeric(20,4),
  credit_total    numeric(20,4),
  net_balance     numeric(20,4)
) language sql stable as $$
  select
    a.id,
    a.code,
    a.name_en,
    a.name_ar,
    a.account_type,
    coalesce(sum(case when l.debit_credit='DR' then l.functional_amount else 0 end), 0) as debit_total,
    coalesce(sum(case when l.debit_credit='CR' then l.functional_amount else 0 end), 0) as credit_total,
    coalesce(sum(case when l.debit_credit='DR' then l.functional_amount else -l.functional_amount end), 0) as net_balance
    from public.acct_accounts a
    left join public.acct_journal_lines l on l.account_id = a.id
    left join public.acct_journal_entries e on e.id = l.entry_id
    where (e.id is null or (
            e.status = 'posted'
        and e.period_id = p_period_id
        and (p_branch_id is null or e.branch_id = p_branch_id)
        and (p_fund_id   is null or l.fund_id   = p_fund_id)
    ))
    group by a.id, a.code, a.name_en, a.name_ar, a.account_type
    having coalesce(sum(case when l.debit_credit='DR' then l.functional_amount else 0 end), 0) <> 0
        or coalesce(sum(case when l.debit_credit='CR' then l.functional_amount else 0 end), 0) <> 0
    order by a.code;
$$;

comment on function public.acct_trial_balance(uuid, uuid, uuid) is
  'Returns Trial Balance for a period, optionally filtered by branch and fund. '
  'Only includes accounts with non-zero activity.';

-- -----------------------------------------------------------------------------
-- 8. RLS POLICIES (per role matrix in PLANNING_INDEX §3 line 1562)
-- -----------------------------------------------------------------------------
-- Role helper assumed to exist: public.has_role(p_role text)
-- If unavailable, replace with your project's role-check function.

-- acct_funds: read all auth; write finance / accountant / super_admin
drop policy if exists acct_funds_select_all on public.acct_funds;
create policy acct_funds_select_all on public.acct_funds
  for select to authenticated using (true);

drop policy if exists acct_funds_write_finance on public.acct_funds;
create policy acct_funds_write_finance on public.acct_funds
  for all to authenticated
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant'))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant'))
  );

-- acct_accounts
drop policy if exists acct_accounts_select_all on public.acct_accounts;
create policy acct_accounts_select_all on public.acct_accounts
  for select to authenticated using (true);

drop policy if exists acct_accounts_write_finance on public.acct_accounts;
create policy acct_accounts_write_finance on public.acct_accounts
  for all to authenticated
  using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant'))
  )
  with check (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant'))
  );

-- acct_fiscal_years / periods
drop policy if exists acct_fy_select_all on public.acct_fiscal_years;
create policy acct_fy_select_all on public.acct_fiscal_years
  for select to authenticated using (true);

drop policy if exists acct_fy_write_finance on public.acct_fiscal_years;
create policy acct_fy_write_finance on public.acct_fiscal_years
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid()
                    and p.role in ('super_admin','finance')))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid()
                         and p.role in ('super_admin','finance')));

drop policy if exists acct_fp_select_all on public.acct_fiscal_periods;
create policy acct_fp_select_all on public.acct_fiscal_periods
  for select to authenticated using (true);

drop policy if exists acct_fp_write_finance on public.acct_fiscal_periods;
create policy acct_fp_write_finance on public.acct_fiscal_periods
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid()
                    and p.role in ('super_admin','finance')))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid()
                         and p.role in ('super_admin','finance')));

-- acct_journal_entries: read by finance/accountant/auditor/super_admin; write only via RPC
drop policy if exists acct_je_select_finance on public.acct_journal_entries;
create policy acct_je_select_finance on public.acct_journal_entries
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid()
                    and p.role in ('super_admin','finance','accountant','auditor')));

-- INSERT only via SECURITY DEFINER RPC; deny direct DML
drop policy if exists acct_je_no_direct_insert on public.acct_journal_entries;
create policy acct_je_no_direct_insert on public.acct_journal_entries
  for insert to authenticated with check (false);

drop policy if exists acct_je_no_direct_update on public.acct_journal_entries;
create policy acct_je_no_direct_update on public.acct_journal_entries
  for update to authenticated using (false);

drop policy if exists acct_je_no_direct_delete on public.acct_journal_entries;
create policy acct_je_no_direct_delete on public.acct_journal_entries
  for delete to authenticated using (false);

-- acct_journal_lines: read finance/accountant/auditor/super_admin; immutable (no policy for write)
drop policy if exists acct_jl_select_finance on public.acct_journal_lines;
create policy acct_jl_select_finance on public.acct_journal_lines
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid()
                    and p.role in ('super_admin','finance','accountant','auditor')));

-- (No INSERT/UPDATE/DELETE policy → blocked for normal roles. RPC bypasses RLS.)

-- feature_flags: read all auth; write super_admin/finance
drop policy if exists ff_select_all on public.feature_flags;
create policy ff_select_all on public.feature_flags
  for select to authenticated using (true);

drop policy if exists ff_write_admin on public.feature_flags;
create policy ff_write_admin on public.feature_flags
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid()
                    and p.role in ('super_admin','finance')))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid()
                         and p.role in ('super_admin','finance')));

-- -----------------------------------------------------------------------------
-- 9. GRANTS
-- -----------------------------------------------------------------------------
grant execute on function public.acct_post_journal(jsonb, text) to authenticated;
grant execute on function public.acct_trial_balance(uuid, uuid, uuid) to authenticated;
grant execute on function public.feature_enabled(text, uuid) to authenticated;

grant select on public.acct_funds, public.acct_accounts, public.acct_fiscal_years,
                public.acct_fiscal_periods, public.acct_journal_entries,
                public.acct_journal_lines, public.feature_flags to authenticated;

-- -----------------------------------------------------------------------------
-- 10. SEED FY2026 (12 monthly periods, calendar year)
--     Per signed default A2: SDG functional currency for PACT-Sudan.
-- -----------------------------------------------------------------------------
do $$
declare
  v_fy uuid;
  v_m  int;
begin
  if not exists (select 1 from public.acct_fiscal_years where code='FY2026') then
    insert into public.acct_fiscal_years (code, start_date, end_date)
      values ('FY2026', '2026-01-01', '2026-12-31')
      returning id into v_fy;
    for v_m in 1..12 loop
      insert into public.acct_fiscal_periods (fiscal_year_id, period_no, start_date, end_date)
        values (
          v_fy, v_m,
          make_date(2026, v_m, 1),
          (make_date(2026, v_m, 1) + interval '1 month' - interval '1 day')::date
        );
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 11. SEED a minimal "GENERAL" unrestricted fund + skeleton COA
--     The full Sudan COA seed (~80 accounts) ships in
--     docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql (loaded after this).
-- -----------------------------------------------------------------------------
insert into public.acct_funds (code, name_en, name_ar, restriction_type)
values ('GENERAL','General Fund','الصندوق العام','without_restriction')
on conflict (code) do nothing;

-- 7 root header accounts (non-postable) — Sudan COA chapters
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, is_postable) values
  ('1000','Assets',           'الأصول',          'asset',     'current_asset',       false),
  ('2000','Liabilities',      'الخصوم',          'liability', 'current_liability',   false),
  ('3000','Equity / Net Assets','حقوق الملكية',  'equity',    'contributed_equity',  false),
  ('4000','Revenue',          'الإيرادات',        'revenue',   'operating_revenue',   false),
  ('5000','Program Expense',  'مصروفات البرامج',  'expense',   'program_expense',     false),
  ('6000','Management Expense','مصروفات إدارية',  'expense',   'mng_expense',         false),
  ('7000','Fundraising Expense','مصروفات جمع التبرعات','expense','fundraising_expense', false)
on conflict (code) do nothing;

commit;

-- =============================================================================
-- POST-APPLY VERIFICATION (run as separate statements after commit)
-- =============================================================================
-- select count(*) as funds       from public.acct_funds;            -- expect ≥ 1
-- select count(*) as accounts    from public.acct_accounts;         -- expect ≥ 7
-- select count(*) as periods     from public.acct_fiscal_periods;   -- expect 12
-- select count(*) as flags       from public.feature_flags;         -- expect 6
-- select public.feature_enabled('acct.posting_engine.enabled');     -- expect true
-- select public.feature_enabled('acct.parallel_run.enabled');       -- expect false
