-- =============================================================================
-- PACT Accounting — Phase 1 Sprint 1.2 ROLLBACK
-- =============================================================================
-- Reverses 20260508_acct_phase1_sprint1_2.sql.
-- Restores acct_post_journal to its Sprint 1.1 form.
-- Refuses to drop if any AML alerts / SoD violations / audit rows exist.
-- =============================================================================

begin;

-- Safety: refuse rollback if there are recorded compliance events
do $$
declare
  v_alerts int := 0;
  v_violations int := 0;
  v_audit int := 0;
begin
  if to_regclass('public.acct_aml_alerts') is not null then
    select count(*) into v_alerts from public.acct_aml_alerts;
  end if;
  if to_regclass('public.acct_sod_violations') is not null then
    select count(*) into v_violations from public.acct_sod_violations;
  end if;
  if to_regclass('public.acct_finance_audit_log') is not null then
    select count(*) into v_audit from public.acct_finance_audit_log;
  end if;

  if v_alerts + v_violations + v_audit > 0 then
    raise exception 'ROLLBACK_BLOCKED: % AML alerts, % SoD violations, % audit rows '
                    'exist. Archive these compliance records before rolling back.',
                    v_alerts, v_violations, v_audit;
  end if;
end $$;

-- Drop triggers
drop trigger if exists trg_acct_audit_funds    on public.acct_funds;
drop trigger if exists trg_acct_audit_accounts on public.acct_accounts;
drop trigger if exists trg_acct_audit_periods  on public.acct_fiscal_periods;
drop trigger if exists trg_acct_audit_flags    on public.feature_flags;

-- Drop trigger function
drop function if exists public.acct_log_finance_change();

-- Drop RPCs (will recreate posting RPC as Sprint 1.1 form below)
drop function if exists public.acct_screen_party(uuid);
drop function if exists public.acct_check_sod(uuid, text, jsonb);
drop function if exists public.acct_normalize_name(text);

-- Drop tables
drop table if exists public.acct_finance_audit_log cascade;
drop table if exists public.acct_sod_violations    cascade;
drop table if exists public.acct_sod_rules         cascade;
drop table if exists public.acct_aml_alerts        cascade;
drop table if exists public.acct_sanctioned_parties cascade;

-- Drop enums
do $$ begin drop type if exists acct_aml_status;     exception when dependent_objects_still_exist then null; end $$;
do $$ begin drop type if exists acct_sanctions_list; exception when dependent_objects_still_exist then null; end $$;

-- Restore acct_post_journal to the EXACT Sprint 1.1 body
-- (verbatim copy from supabase/migrations/20260501_acct_phase1_sprint1_1.sql,
-- including the Sprint 1.1 sanctions/SoD placeholder sections — once the
-- acct_sanctioned_parties table is dropped above, the placeholder sanctions
-- block becomes a runtime no-op via to_regclass, exactly as it was before
-- Sprint 1.2 was applied).
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

  perform pg_notify('acct_journal_posted', v_entry_id::text);

  return v_entry_id;
end $$;

comment on function public.acct_post_journal(jsonb, text) is
  'Posts a balanced journal entry. Idempotent on p_idempotency_key. '
  'Raises: PERIOD_CLOSED, BALANCE_MISMATCH, ACCOUNT_INACTIVE, ACCOUNT_NOT_POSTABLE, '
  'MISSING_FUND, MISSING_FUNCTION, FX_RATE_MISSING, SANCTIONS_BLOCK, '
  'POSTING_ENGINE_DISABLED, AUTH_REQUIRED, IDEMPOTENCY_KEY_REQUIRED.';

commit;
