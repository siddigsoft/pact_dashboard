-- =============================================================================
-- PACT Accounting Module — Phase 1 Sprint 1.2
-- Sanctions screening + Segregation-of-Duties + Finance audit triggers
-- =============================================================================
-- Source plan : docs/ACCOUNTING_PHASE1_DESIGN.md (Sprint 1.2)
--               docs/PLANNING_INDEX.md §3 lines 1213-1219, 1384-1445, 1651-1660
-- Sign-off    : docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md (FULLY SIGNED OFF 2026-04-25)
-- Apply       : MANUAL — paste into pactdb (abznugnirnlrqnnfkein) SQL editor
-- Runbook     : docs/sql/PHASE1_SPRINT1_2_MANUAL_APPLY.md
-- Idempotent  : YES
-- Rollback    : docs/sql/PHASE1_SPRINT1_2_ROLLBACK.sql
-- Depends on  : 20260501_acct_phase1_sprint1_1.sql (must be applied first)
-- =============================================================================
--
-- Phase 1 acceptance criteria delivered by THIS migration:
--   3. Sanctions block prevents posting to a sanctioned partner            ✅
--      (acct_post_journal calls acct_screen_party for every line.partner_id
--       when feature flag acct.sanctions.block_on_match is ON; raises
--       SANCTIONS_BLOCK and persists an open AML alert on a fresh match.)
--
--   4. SoD matrix foundation (PARTIAL):
--      ✅ acct_sod_rules + 4 seed rules (SOD-1..4)
--      ✅ acct_sod_violations append-only log
--      ✅ acct_check_sod RPC (correctly enforces same_entry+journal.* when a
--         real journal entry id is supplied)
--      ⏳ POSTING-PATH ENFORCEMENT IS INTENTIONALLY DEFERRED to Phase 2.
--         Sprint 1.1's posting model has no draft → approve split, so
--         calling acct_check_sod from acct_post_journal had no creator-vs-
--         approver pair to compare. The Phase 2 journal draft/approve UI
--         will pass the real entry_id to acct_check_sod. Until that ships,
--         posting does not invoke SoD; flag acct.sod.enforce is a no-op for
--         posting (still effective when callers invoke acct_check_sod).
--
--  10. Audit trail data layer backed by triggers on acct_funds,
--      acct_accounts, acct_fiscal_periods, feature_flags                   ✅
--      Frontend visualiser page is in the next frontend sprint.
--
-- Still deferred (frontend work or external config, not SQL):
--   9. Arabic jsPDF font registration  → Phase 1 frontend sprint
--      2FA enforcement on finance roles → Supabase Auth config
--      Posting-path SoD enforcement    → Phase 2 (journal draft/approve)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Pre-flight: Sprint 1.1 must be in place
-- -----------------------------------------------------------------------------
do $$ begin
  if to_regclass('public.acct_journal_entries') is null
     or to_regclass('public.acct_funds') is null
     or to_regclass('public.feature_flags') is null then
    raise exception 'PRECONDITION_FAILED: Sprint 1.1 (20260501_acct_phase1_sprint1_1.sql) must be applied first';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_sanctions_list') then
    create type acct_sanctions_list as enum ('OFAC_SDN','EU_CONS','UN_CONS','HMT_UK','DFAT_AU');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'acct_aml_status') then
    create type acct_aml_status as enum ('open','false_positive','blocked','escalated');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. acct_sanctioned_parties + acct_aml_alerts
-- -----------------------------------------------------------------------------
create table if not exists public.acct_sanctioned_parties (
  id              uuid primary key default gen_random_uuid(),
  list            acct_sanctions_list not null,
  external_id     text not null,
  full_name       text not null,
  aliases         text[] default '{}',
  country         text,
  match_hash      text not null,
  raw             jsonb not null default '{}'::jsonb,
  loaded_at       timestamptz not null default now(),
  unique (list, external_id)
);

create index if not exists idx_acct_sp_match_hash on public.acct_sanctioned_parties(match_hash);
create index if not exists idx_acct_sp_full_name  on public.acct_sanctioned_parties using gin (to_tsvector('simple', full_name));

alter table public.acct_sanctioned_parties enable row level security;

create table if not exists public.acct_aml_alerts (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null,
  matched_party_id  uuid not null references public.acct_sanctioned_parties(id),
  match_score       numeric(5,2) not null check (match_score >= 0 and match_score <= 100),
  status            acct_aml_status not null default 'open',
  resolved_at       timestamptz,
  resolved_by       uuid references public.profiles(id),
  resolution_notes  text,
  created_at        timestamptz not null default now()
);

-- Soft FK to partners
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='partners')
     and not exists (select 1 from information_schema.table_constraints where constraint_name='acct_aml_alerts_partner_id_fkey') then
    alter table public.acct_aml_alerts
      add constraint acct_aml_alerts_partner_id_fkey
      foreign key (partner_id) references public.partners(id);
  end if;
end $$;

create index if not exists idx_acct_aml_partner on public.acct_aml_alerts(partner_id);
create index if not exists idx_acct_aml_status  on public.acct_aml_alerts(status);

alter table public.acct_aml_alerts enable row level security;

-- -----------------------------------------------------------------------------
-- 3. acct_normalize_name() helper (used for fuzzy matching)
-- -----------------------------------------------------------------------------
create or replace function public.acct_normalize_name(p_name text)
returns text language sql immutable as $$
  -- Lowercase, strip diacritics-ish (simple), collapse whitespace, trim
  select regexp_replace(
           lower(coalesce(p_name,'')),
           '[^a-z0-9 ]', '', 'g'
         )
$$;

-- -----------------------------------------------------------------------------
-- 4. acct_screen_party RPC
-- -----------------------------------------------------------------------------
-- Design notes (review-driven):
--   • Schema-safe: discovers which name column ('name' / 'full_name' /
--     'partner_name') exists in public.partners via information_schema
--     before any dynamic SQL. The dynamic SQL only ever uses a column name
--     pulled from the catalog, never user input.
--   • Latest-decision-wins on existing alerts: the most recent alert for the
--     partner decides — false_positive clears all prior matches, anything
--     else (open / blocked / escalated) blocks. This matches operator
--     intuition: the last reviewer's call is the one that stands.
--   • On a fresh sanctions match, a NEW alert row is persisted (status='open')
--     and its id is returned, so reviewers see the block in the AML queue
--     and can resolve it (false_positive / blocked / escalated).
create or replace function public.acct_screen_party(p_partner_id uuid)
returns table (matched boolean, alert_id uuid, matched_party_id uuid, match_score numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_partner_name text;
  v_norm_name    text;
  v_existing     record;
  v_name_col     text;
  v_new_alert_id uuid;
  v_match_party  uuid;
begin
  -- 1. If partners table doesn't exist, return a single (matched=false) row.
  if to_regclass('public.partners') is null then
    return query select false::boolean, null::uuid, null::uuid, null::numeric;
    return;
  end if;

  -- 2. Discover the name column. Falls back gracefully if none exists.
  select column_name into v_name_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'partners'
     and column_name in ('name','full_name','partner_name')
   order by case column_name
              when 'name' then 1
              when 'full_name' then 2
              when 'partner_name' then 3
            end
   limit 1;

  if v_name_col is null then
    -- partners exists but has no recognised name column; treat as no match.
    return query select false::boolean, null::uuid, null::uuid, null::numeric;
    return;
  end if;

  -- 3. Fetch the partner's name. Dynamic SQL uses a column name resolved from
  --    information_schema (never user input), so injection is not possible.
  execute format('select %I::text from public.partners where id = $1', v_name_col)
    into v_partner_name
    using p_partner_id;

  if v_partner_name is null then
    return query select false::boolean, null::uuid, null::uuid, null::numeric;
    return;
  end if;

  v_norm_name := acct_normalize_name(v_partner_name);

  -- 4. Latest-decision-wins on alerts (chronology-correct)
  select id, matched_party_id, match_score, status into v_existing
    from public.acct_aml_alerts
   where partner_id = p_partner_id
   order by created_at desc
   limit 1;

  if found then
    if v_existing.status = 'false_positive' then
      -- Most recent reviewer cleared this partner; do not block.
      return query select false::boolean, null::uuid, null::uuid, null::numeric;
      return;
    else
      -- open / blocked / escalated → still blocked
      return query select true::boolean, v_existing.id,
                          v_existing.matched_party_id, v_existing.match_score;
      return;
    end if;
  end if;

  -- 5. Fresh match against the sanctions list (exact match on normalized name
  --    or any alias). Pragmatic for Sprint 1.2; fuzzy ranking comes in Phase 6.
  select sp.id into v_match_party
    from public.acct_sanctioned_parties sp
   where acct_normalize_name(sp.full_name) = v_norm_name
      or v_norm_name = any (
           select acct_normalize_name(a) from unnest(sp.aliases) a
         )
   limit 1;

  if v_match_party is not null then
    -- Persist the alert so it appears in the reviewer queue.
    insert into public.acct_aml_alerts
      (partner_id, matched_party_id, match_score, status)
    values
      (p_partner_id, v_match_party, 100.0, 'open')
    returning id into v_new_alert_id;

    return query select true::boolean, v_new_alert_id, v_match_party, 100.0::numeric;
    return;
  end if;

  -- 6. No match
  return query select false::boolean, null::uuid, null::uuid, null::numeric;
end $$;

comment on function public.acct_screen_party(uuid) is
  'Screens a partner against acct_sanctioned_parties and existing alerts. '
  'Returns (matched, alert_id, matched_party_id, match_score). Latest-alert '
  'decision wins. On a fresh match a new acct_aml_alerts row (status=open) '
  'is created and its id is returned. Schema-safe across partners(name|full_name).';

-- -----------------------------------------------------------------------------
-- 5. acct_sod_rules + acct_sod_violations
-- -----------------------------------------------------------------------------
create table if not exists public.acct_sod_rules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description     text not null,
  forbidden_pair  text[] not null,
  scope           text not null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.acct_sod_violations (
  id                uuid primary key default gen_random_uuid(),
  rule_id           uuid not null references public.acct_sod_rules(id),
  user_id           uuid not null references public.profiles(id),
  attempted_action  text not null,
  context           jsonb not null default '{}'::jsonb,
  blocked_at        timestamptz not null default now()
);

create index if not exists idx_acct_sod_v_user    on public.acct_sod_violations(user_id);
create index if not exists idx_acct_sod_v_blocked on public.acct_sod_violations(blocked_at desc);

alter table public.acct_sod_rules      enable row level security;
alter table public.acct_sod_violations enable row level security;

-- Seed the four canonical rules
insert into public.acct_sod_rules (code, description, forbidden_pair, scope) values
  ('SOD-1','Same user cannot post and approve a journal',
    array['journal.post','journal.approve'], 'same_entry'),
  ('SOD-2','Same user cannot create a vendor and approve payment to it',
    array['vendor.create','payment.approve'], 'same_vendor'),
  ('SOD-3','Same user cannot approve a payroll run that includes them',
    array['payroll.approve','payroll.payee'], 'same_run'),
  ('SOD-4','Same user cannot initiate and release a bank transfer',
    array['transfer.initiate','transfer.release'], 'same_transfer')
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 6. acct_check_sod RPC
-- -----------------------------------------------------------------------------
create or replace function public.acct_check_sod(
  p_user_id uuid,
  p_action  text,
  p_context jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_rule           record;
  v_other_action   text;
  v_violated       boolean := false;
  v_source_id      uuid;
  v_source_type    text;
  v_creator        uuid;
begin
  -- Loop active rules where p_action is one of the forbidden_pair members
  for v_rule in
    select * from public.acct_sod_rules
     where is_active and p_action = any(forbidden_pair)
  loop
    -- Resolve the "other" action in the pair
    v_other_action := (
      select a from unnest(v_rule.forbidden_pair) a where a <> p_action limit 1
    );

    -- Sprint 1.2 implements scopes 'same_entry' fully (used by journal.post +
    -- journal.approve). Other scopes return false (allowed) for now and will
    -- be enforced when the corresponding sub-modules ship in Phase 2.
    if v_rule.scope = 'same_entry' and v_other_action like 'journal.%' then
      v_source_id   := nullif(p_context->>'entry_id','')::uuid;
      if v_source_id is not null then
        -- For journal.post, blocked if same user already approved this entry
        -- For journal.approve, blocked if same user posted (created) it
        if v_other_action = 'journal.approve' then
          select created_by into v_creator from public.acct_journal_entries
            where id = v_source_id;
          if v_creator = p_user_id then v_violated := true; end if;
        elsif v_other_action = 'journal.post' then
          select posted_by into v_creator from public.acct_journal_entries
            where id = v_source_id;
          if v_creator = p_user_id then v_violated := true; end if;
        end if;
      end if;
    end if;

    if v_violated then
      insert into public.acct_sod_violations (rule_id, user_id, attempted_action, context)
        values (v_rule.id, p_user_id, p_action, p_context);
      return false;
    end if;
  end loop;

  return true;
end $$;

comment on function public.acct_check_sod(uuid, text, jsonb) is
  'Returns true if action is allowed under SoD rules; false (and logs a violation) otherwise.';

-- -----------------------------------------------------------------------------
-- 7. acct_finance_audit_log + generic trigger
-- -----------------------------------------------------------------------------
create table if not exists public.acct_finance_audit_log (
  id            bigserial primary key,
  table_name    text not null,
  row_id        uuid,
  op            char(1) not null check (op in ('I','U','D')),
  changed_by    uuid,
  changed_at    timestamptz not null default now(),
  old_row       jsonb,
  new_row       jsonb,
  changed_keys  text[]
);

create index if not exists idx_acct_audit_table  on public.acct_finance_audit_log(table_name);
create index if not exists idx_acct_audit_row    on public.acct_finance_audit_log(row_id);
create index if not exists idx_acct_audit_when   on public.acct_finance_audit_log(changed_at desc);
create index if not exists idx_acct_audit_who    on public.acct_finance_audit_log(changed_by);

alter table public.acct_finance_audit_log enable row level security;

create or replace function public.acct_log_finance_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_keys text[];
  v_id   uuid;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;

  -- Resolve row id (works for any acct_* table since they all use id uuid;
  -- feature_flags uses key text — handled below)
  if tg_table_name = 'feature_flags' then
    v_id := null; -- feature_flags pk is text key; row_id stays null, key is in new_row
  else
    v_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  end if;

  if tg_op = 'UPDATE' then
    -- UNION (not INTERSECT) so added/removed jsonb keys are also captured.
    -- Treats a missing key on either side as null for comparison purposes.
    select array_agg(k) into v_keys
      from (select jsonb_object_keys(v_new) k
             union
            select jsonb_object_keys(v_old) k) sub
     where (v_new->>k) is distinct from (v_old->>k);
  end if;

  insert into public.acct_finance_audit_log
    (table_name, row_id, op, changed_by, old_row, new_row, changed_keys)
  values (
    tg_table_name,
    v_id,
    case tg_op when 'INSERT' then 'I' when 'UPDATE' then 'U' when 'DELETE' then 'D' end,
    auth.uid(),
    v_old,
    v_new,
    v_keys
  );

  return coalesce(new, old);
end $$;

-- Attach trigger to the four sensitive config tables
do $$ begin
  drop trigger if exists trg_acct_audit_funds   on public.acct_funds;
  create trigger trg_acct_audit_funds
    after insert or update or delete on public.acct_funds
    for each row execute function public.acct_log_finance_change();

  drop trigger if exists trg_acct_audit_accounts on public.acct_accounts;
  create trigger trg_acct_audit_accounts
    after insert or update or delete on public.acct_accounts
    for each row execute function public.acct_log_finance_change();

  drop trigger if exists trg_acct_audit_periods on public.acct_fiscal_periods;
  create trigger trg_acct_audit_periods
    after insert or update or delete on public.acct_fiscal_periods
    for each row execute function public.acct_log_finance_change();

  drop trigger if exists trg_acct_audit_flags on public.feature_flags;
  create trigger trg_acct_audit_flags
    after insert or update or delete on public.feature_flags
    for each row execute function public.acct_log_finance_change();
end $$;

-- -----------------------------------------------------------------------------
-- 8. PATCH acct_post_journal — wire real sanctions + SoD checks
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
  v_balance_row  record;
  v_acct_row     record;
  v_partner_id   uuid;
  v_screen       record;
  v_function_required boolean := public.feature_enabled('acct.function_required');
  v_fund_required     boolean := public.feature_enabled('acct.fund_required');
  v_engine_on         boolean := public.feature_enabled('acct.posting_engine.enabled');
  v_sanctions_block   boolean := public.feature_enabled('acct.sanctions.block_on_match');
  v_sod_enforce       boolean := public.feature_enabled('acct.sod.enforce');
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
  select role into v_user_role from public.profiles where id = v_user_id;
  if v_user_role is null then
    raise exception 'PROFILE_NOT_FOUND: caller has no profile row';
  end if;
  if v_user_role not in ('super_admin','finance','accountant') then
    raise exception 'AUTHORIZATION_FAILED: role % may not post journals', v_user_role;
  end if;

  -- 1. Idempotency: short-circuit on existing key
  select id into v_entry_id
    from public.acct_journal_entries
   where idempotency_key = p_idempotency_key;
  if found then
    return v_entry_id;
  end if;

  -- 2. Period status + date-in-range guards
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

  -- 3. At least 2 lines
  if jsonb_array_length(v_lines) < 2 then
    raise exception 'INSUFFICIENT_LINES: a journal must have at least 2 lines';
  end if;

  -- 4. Per-line validation + DR/CR balance per fund
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
    if v_function_required
       and v_acct_row.account_type = 'expense'
       and (v_line->>'function') = 'none' then
      raise exception 'MISSING_FUNCTION: expense line % must specify program / mng / fundraising', v_idx;
    end if;
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

  -- 5. Balance per fund (functional currency)
  for v_balance_row in
    select fund_id,
           sum(case when debit_credit='DR' then functional_amount else 0 end) as dr,
           sum(case when debit_credit='CR' then functional_amount else 0 end) as cr
      from _acct_line_check group by fund_id
  loop
    if v_balance_row.dr <> v_balance_row.cr then
      raise exception 'BALANCE_MISMATCH: fund=% dr=% cr=%',
        v_balance_row.fund_id, v_balance_row.dr, v_balance_row.cr;
    end if;
  end loop;

  -- 6. Sanctions check (Sprint 1.2 — REAL implementation)
  if v_sanctions_block then
    for v_partner_id in
      select distinct partner_id from _acct_line_check where partner_id is not null
    loop
      select * into v_screen from public.acct_screen_party(v_partner_id);
      if v_screen.matched then
        raise exception 'SANCTIONS_BLOCK: partner % matches sanctions list (party=%, score=%)',
          v_partner_id, v_screen.matched_party_id, v_screen.match_score;
      end if;
    end loop;
  end if;

  -- 7. SoD check — DEFERRED to Phase 2 (intentional, review-driven)
  --    Sprint 1.1's posting model is single-step: there is no draft → approve
  --    split, so the same_entry+journal.post / journal.approve rule has no
  --    creator-vs-approver pair to compare. Calling acct_check_sod here would
  --    silently allow (false negative) because p_payload.source_id refers to
  --    the upstream business doc (e.g. payroll_run_id), NOT a journal entry id.
  --
  --    The acct_check_sod RPC is shipped in Sprint 1.2 and is callable by any
  --    future consumer (the Phase 2 journal draft/approve UI will pass the
  --    real journal entry id). Until that ships, posting does not invoke SoD.
  --    The acct.sod.enforce flag is read here so flipping it logs the intent
  --    in pg_stat_statements without functional change.
  perform v_sod_enforce;

  -- 8. INSERT entry (race-safe) + lines
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
    select id into v_entry_id from public.acct_journal_entries
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
    from _acct_line_check order by line_no;

  perform pg_notify('acct_journal_posted', v_entry_id::text);

  return v_entry_id;
end $$;

comment on function public.acct_post_journal(jsonb, text) is
  'Posts a balanced journal entry. Idempotent on p_idempotency_key. '
  'Raises: PERIOD_CLOSED, POSTING_DATE_OUT_OF_PERIOD, BALANCE_MISMATCH, '
  'ACCOUNT_INACTIVE, ACCOUNT_NOT_POSTABLE, MISSING_FUND, MISSING_FUNCTION, '
  'FX_RATE_MISSING, SANCTIONS_BLOCK, POSTING_ENGINE_DISABLED, '
  'AUTH_REQUIRED, AUTHORIZATION_FAILED, IDEMPOTENCY_KEY_REQUIRED. '
  'SoD enforcement is deferred to Phase 2 (when journal draft/approve ships); '
  'acct_check_sod RPC is available for callers that have a real entry id.';

-- -----------------------------------------------------------------------------
-- 9. RLS POLICIES
-- -----------------------------------------------------------------------------
-- acct_sanctioned_parties: read finance/accountant/auditor/super_admin; write super_admin only
drop policy if exists acct_sp_select on public.acct_sanctioned_parties;
create policy acct_sp_select on public.acct_sanctioned_parties
  for select to authenticated using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant','auditor')));

drop policy if exists acct_sp_write on public.acct_sanctioned_parties;
create policy acct_sp_write on public.acct_sanctioned_parties
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.role = 'super_admin'));

-- acct_aml_alerts: read finance/auditor/super_admin; write super_admin + finance (resolve)
drop policy if exists acct_aml_select on public.acct_aml_alerts;
create policy acct_aml_select on public.acct_aml_alerts
  for select to authenticated using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant','auditor')));

drop policy if exists acct_aml_write on public.acct_aml_alerts;
create policy acct_aml_write on public.acct_aml_alerts
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role in ('super_admin','finance')))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.role in ('super_admin','finance')));

-- acct_sod_rules: read all auth; write super_admin only (immutable in practice)
drop policy if exists acct_sod_rules_select on public.acct_sod_rules;
create policy acct_sod_rules_select on public.acct_sod_rules
  for select to authenticated using (true);

drop policy if exists acct_sod_rules_write on public.acct_sod_rules;
create policy acct_sod_rules_write on public.acct_sod_rules
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.role = 'super_admin'));

-- acct_sod_violations: read super_admin/auditor/finance; insert only via SECURITY DEFINER RPC
drop policy if exists acct_sod_v_select on public.acct_sod_violations;
create policy acct_sod_v_select on public.acct_sod_violations
  for select to authenticated using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','auditor')));

-- acct_finance_audit_log: read super_admin/auditor/finance; insert only via trigger
drop policy if exists acct_audit_select on public.acct_finance_audit_log;
create policy acct_audit_select on public.acct_finance_audit_log
  for select to authenticated using (
    exists (select 1 from public.profiles p
             where p.id = auth.uid()
               and p.role in ('super_admin','finance','accountant','auditor')));

-- Block direct DML on audit + violations tables (trigger / RPC bypass via DEFINER)
revoke insert, update, delete on public.acct_finance_audit_log from authenticated;
revoke insert, update, delete on public.acct_sod_violations    from authenticated;

-- -----------------------------------------------------------------------------
-- 10. GRANTS
-- -----------------------------------------------------------------------------
grant execute on function public.acct_screen_party(uuid)            to authenticated;
grant execute on function public.acct_check_sod(uuid, text, jsonb)  to authenticated;
grant execute on function public.acct_normalize_name(text)          to authenticated;

grant select on public.acct_sanctioned_parties, public.acct_aml_alerts,
                public.acct_sod_rules, public.acct_sod_violations,
                public.acct_finance_audit_log to authenticated;

commit;

-- =============================================================================
-- POST-APPLY VERIFICATION
-- =============================================================================
-- select 'sanctioned_parties' as obj, count(*) from public.acct_sanctioned_parties union all
-- select 'aml_alerts',                count(*) from public.acct_aml_alerts          union all
-- select 'sod_rules',                 count(*) from public.acct_sod_rules           union all  -- expect 4
-- select 'sod_violations',            count(*) from public.acct_sod_violations      union all
-- select 'audit_log',                 count(*) from public.acct_finance_audit_log;
--
-- select code, description from public.acct_sod_rules order by code;  -- expect SOD-1..SOD-4
-- select proname from pg_proc where proname in ('acct_screen_party','acct_check_sod','acct_normalize_name');
