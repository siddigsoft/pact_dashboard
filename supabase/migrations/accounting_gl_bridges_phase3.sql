-- =============================================================================
-- PACT Accounting — Phase 3 · GL Bridge Engine Extension
-- Wires HR, Grant, and Period-Close modules to General Ledger automatically
-- =============================================================================
-- Migration  : accounting_gl_bridges_phase3.sql
-- Depends on : 20260520_acct_phase2_gl_bridges.sql  (bridge engine)
--              hr_advances_grant_milestones.sql       (hr_salary_advances, acct_grant_expenses)
-- Apply      : MANUAL — paste into Supabase SQL editor
-- Idempotent : YES — all blocks use CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT
--
-- NOTE: No outer BEGIN/COMMIT wrapper intentionally.
-- Each statement auto-commits so locks are released immediately.
-- This prevents deadlocks caused by the live app reading `profiles` for RLS
-- while this migration holds an exclusive lock on the same table.
-- If any statement fails, simply re-run — all statements are idempotent.
-- =============================================================================

-- Fail fast if a lock cannot be acquired rather than waiting and deadlocking.
-- (deadlock_timeout requires superuser — omitted; lock_timeout is sufficient)
set lock_timeout = '5s';

-- =============================================================================
-- PART 0: Self-contained prerequisites
-- Creates the bridge log table and posting function if Phase 2 was not yet run.
-- All statements are idempotent — safe to run even if Phase 2 already exists.
-- =============================================================================

-- 0a. GL Bridge audit log table
create table if not exists public.acct_gl_bridge_log (
  id               uuid primary key default gen_random_uuid(),
  source_table     text not null,
  source_id        uuid not null,
  event_type       text not null,
  status           text not null check (status in ('success','error','skipped')),
  journal_entry_id uuid references public.acct_journal_entries(id),
  error_message    text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_acct_bridge_log_source
  on public.acct_gl_bridge_log (source_table, source_id);
create index if not exists idx_acct_bridge_log_status
  on public.acct_gl_bridge_log (status);
create index if not exists idx_acct_bridge_log_created
  on public.acct_gl_bridge_log (created_at desc);

alter table public.acct_gl_bridge_log enable row level security;

drop policy if exists bridge_log_select on public.acct_gl_bridge_log;
create policy bridge_log_select on public.acct_gl_bridge_log
  for select to authenticated using (
    exists (
      select 1 from public.profiles
       where id = auth.uid()
         and lower(role) in ('super_admin','superadmin','admin','finance','accountant','auditor','financialadmin')
    )
  );

drop policy if exists bridge_log_insert_service on public.acct_gl_bridge_log;
create policy bridge_log_insert_service on public.acct_gl_bridge_log
  for insert to authenticated with check (true);

-- 0b. Feature flags table (idempotent — in case Phase 1 not yet run either)
create table if not exists public.feature_flags (
  key         text primary key,
  description text,
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 0c. Master posting engine flag (must exist for bridge function gate check)
insert into public.feature_flags (key, description, is_enabled)
values ('acct.posting_engine.enabled', 'Master GL posting engine switch', true)
on conflict (key) do nothing;

-- 0d. Core GL Bridge posting function
-- Called by all trigger functions. SECURITY DEFINER so triggers can post journals.
-- Idempotent on source_table::source_id::event_type.
create or replace function public.acct_bridge_post_journal(
  p_source_table   text,
  p_source_id      uuid,
  p_event_type     text,
  p_posting_date   date,
  p_description_en text,
  p_description_ar text,
  p_lines          jsonb,
  p_posted_by      uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id      uuid;
  v_idempotency   text;
  v_period_id     uuid;
  v_fund_id       uuid;
  v_poster_id     uuid;
  v_line          jsonb;
  v_line_no       int  := 0;
  v_account_id    uuid;
  v_balance       numeric(20,4);
  v_engine_on     boolean;
  v_bridge_on     boolean;
begin
  -- Gate: master engine switch
  select is_enabled into v_engine_on
    from public.feature_flags where key = 'acct.posting_engine.enabled';
  if not coalesce(v_engine_on, false) then
    raise exception 'BRIDGE_SKIP: acct.posting_engine.enabled is OFF';
  end if;

  -- Gate: per-source bridge flag
  select is_enabled into v_bridge_on
    from public.feature_flags where key = 'acct.bridge.' || p_source_table;
  if not coalesce(v_bridge_on, false) then
    raise exception 'BRIDGE_SKIP: acct.bridge.% is OFF', p_source_table;
  end if;

  -- Idempotency: skip if already posted for this source+event
  v_idempotency := p_source_table || '::' || p_source_id::text || '::' || p_event_type;
  select id into v_entry_id
    from public.acct_journal_entries
   where idempotency_key = v_idempotency;
  if found then
    return v_entry_id;
  end if;

  -- Resolve open fiscal period containing posting date
  select id into v_period_id
    from public.acct_fiscal_periods
   where status in ('open','soft_closed')
     and start_date <= p_posting_date
     and end_date   >= p_posting_date
   order by start_date desc
   limit 1;
  if v_period_id is null then
    raise exception 'BRIDGE_NO_PERIOD: no open fiscal period for date %', p_posting_date;
  end if;

  -- Resolve default fund
  select id into v_fund_id
    from public.acct_funds where code = 'GENERAL' and is_active = true limit 1;
  if v_fund_id is null then
    select id into v_fund_id from public.acct_funds where is_active = true order by created_at limit 1;
  end if;
  if v_fund_id is null then
    raise exception 'BRIDGE_NO_FUND: no active fund found';
  end if;

  -- Resolve poster
  v_poster_id := p_posted_by;
  if v_poster_id is null then
    select id into v_poster_id from public.profiles
     where lower(role) in ('super_admin','superadmin') order by created_at limit 1;
  end if;
  if v_poster_id is null then
    raise exception 'BRIDGE_NO_POSTER: no super_admin profile found';
  end if;

  -- Validate minimum lines
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'BRIDGE_INSUFFICIENT_LINES: must supply at least 2 lines';
  end if;

  -- Insert journal entry
  insert into public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, idempotency_key,
    posted_at, posted_by, created_by
  ) values (
    v_period_id, p_posting_date, p_description_en, p_description_ar,
    p_source_table, p_source_id, 'posted', v_idempotency,
    now(), v_poster_id, v_poster_id
  )
  on conflict (idempotency_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select id into v_entry_id from public.acct_journal_entries where idempotency_key = v_idempotency;
    return v_entry_id;
  end if;

  -- Insert journal lines
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    select id into v_account_id
      from public.acct_accounts
     where code = (v_line->>'account_code') and is_postable = true;
    if v_account_id is null then
      raise exception 'BRIDGE_ACCOUNT_NOT_FOUND: code=%', (v_line->>'account_code');
    end if;
    insert into public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function,
      original_amount, original_currency,
      functional_amount, functional_currency,
      debit_credit, description
    ) values (
      v_entry_id, v_line_no, v_account_id, v_fund_id,
      coalesce(v_line->>'function', 'program'),
      (v_line->>'amount')::numeric,
      coalesce(v_line->>'currency', 'SDG'),
      (v_line->>'amount')::numeric,
      'SDG',
      v_line->>'debit_credit',
      v_line->>'description'
    );
  end loop;

  -- Balance check: Σ DR = Σ CR
  select sum(case when debit_credit = 'DR' then functional_amount else -functional_amount end)
    into v_balance
    from public.acct_journal_lines where entry_id = v_entry_id;
  if abs(coalesce(v_balance, 1)) > 0.005 then
    raise exception 'BRIDGE_IMBALANCE: DR/CR mismatch by % for entry %', v_balance, v_entry_id;
  end if;

  perform pg_notify('acct_journal_posted', v_entry_id::text);
  return v_entry_id;
end $$;

comment on function public.acct_bridge_post_journal(text, uuid, text, date, text, text, jsonb, uuid) is
  'Internal SECURITY DEFINER function for GL bridge triggers. '
  'Idempotent on source_table::source_id::event_type. '
  'Defined here so Phase 3 is self-contained even if Phase 2 was not yet applied.';

-- =============================================================================
-- PART A: Add hire_date column to profiles (safe — IF NOT EXISTS)
-- =============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hire_date date;

COMMENT ON COLUMN public.profiles.hire_date IS
  'Employee hire/start date used for EOSB gratuity calculations (Sudan Labour Law).';

-- =============================================================================
-- PART B: New Chart of Accounts for Phase 3 bridges
-- =============================================================================
insert into public.acct_accounts
  (code, name_en, name_ar, account_type, subtype, parent_id, is_postable, country_id)
values
  -- 1520: Salary Advance Receivable (asset — employees owe this back)
  ('1520','Salary Advances Receivable','ذمم السلف المستحقة من الموظفين',
   'asset','current_asset',
   (select id from public.acct_accounts where code='1000' and country_id is null limit 1), true, null),

  -- 2350: EOSB Provision Liability (long-term — accrued gratuity payable)
  ('2350','EOSB Provision Liability','مخصص مكافأة نهاية الخدمة',
   'liability','non_current_liability',
   (select id from public.acct_accounts where code='2000' and country_id is null limit 1), true, null),

  -- 5600: Grant Programme Expense
  ('5600','Grant Programme Expense','مصروفات برامج المنح',
   'expense','program_expense',
   (select id from public.acct_accounts where code='5000' and country_id is null limit 1), true, null),

  -- 6200: EOSB Expense (management expense — monthly provision charge)
  ('6200','EOSB Expense — Staff Gratuity','مصروف مكافأة نهاية الخدمة',
   'expense','mng_expense',
   (select id from public.acct_accounts where code='6000' and country_id is null limit 1), true, null)

-- Targets acct_accounts_code_global_uq partial index (code WHERE country_id IS NULL).
-- The old UNIQUE(code) was dropped in 20260511_acct_country_coa_partitioning.sql.
on conflict (code) where country_id is null do nothing;

-- =============================================================================
-- PART C: Feature flags for Phase 3 GL bridges
-- =============================================================================
insert into public.feature_flags (key, description, is_enabled) values
  ('acct.bridge.eosb_accruals',
   'Auto-post GL journals when eosb_accruals row is inserted (monthly provision)', true),
  ('acct.bridge.hr_salary_advances',
   'Auto-post GL journals when hr_salary_advances status → active (disbursed)', true),
  ('acct.bridge.hr_salary_advance_recoveries',
   'Auto-post GL journals when hr_salary_advance_recoveries row is inserted', true),
  ('acct.bridge.acct_grant_expenses',
   'Auto-post GL journals when acct_grant_expenses row is inserted', true)
on conflict (key) do nothing;

-- =============================================================================
-- PART D: TRIGGER FUNCTION — eosb_accruals
-- Fires on: INSERT (monthly provision run via accrue_eosb_for_period RPC)
-- Journal: DR 6200 EOSB Expense / CR 2350 EOSB Provision Liability
-- =============================================================================
create or replace function public.acct_trig_eosb_accruals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
begin
  if tg_op = 'INSERT' and new.accrued_amount > 0 then
    begin
      v_entry_id := public.acct_bridge_post_journal(
        'eosb_accruals',
        new.id,
        'accrual_posted',
        coalesce(
          to_date(new.period || '-01', 'YYYY-MM-DD'),
          current_date
        ),
        'EOSB Monthly Provision — ' || new.period,
        'مخصص مكافأة نهاية الخدمة الشهري — ' || new.period,
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '6200',
            'amount',       new.accrued_amount,
            'debit_credit', 'DR',
            'description',  'EOSB Expense: ' || new.period,
            'currency',     coalesce(new.currency, 'SDG'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '2350',
            'amount',       new.accrued_amount,
            'debit_credit', 'CR',
            'description',  'EOSB Provision Liability: ' || new.period,
            'currency',     coalesce(new.currency, 'SDG'),
            'function',     'program'
          )
        ),
        new.created_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('eosb_accruals', new.id, 'accrual_posted', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('eosb_accruals', new.id, 'accrual_posted', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_eosb_accruals on public.eosb_accruals;
create trigger acct_bridge_eosb_accruals
  after insert on public.eosb_accruals
  for each row execute function public.acct_trig_eosb_accruals();

-- =============================================================================
-- PART E: TRIGGER FUNCTION — hr_salary_advances
-- Fires on: INSERT with status = 'active'  (advance disbursed to employee)
-- Journal: DR 1520 Salary Advances Receivable / CR 1200 Cash at Bank
-- =============================================================================
create or replace function public.acct_trig_hr_salary_advances()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_staff_name text;
begin
  if tg_op = 'INSERT' and coalesce(new.status, 'active') = 'active' and new.amount > 0 then
    select coalesce(full_name, 'Unknown') into v_staff_name
      from public.profiles where id = new.user_id;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'hr_salary_advances',
        new.id,
        'advance_disbursed',
        coalesce(new.issue_date::date, current_date),
        'Salary Advance Disbursed — ' || coalesce(v_staff_name, new.user_id::text),
        'صرف سلفة راتب — ' || coalesce(v_staff_name, new.user_id::text),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1520',
            'amount',       new.amount,
            'debit_credit', 'DR',
            'description',  'Advance Receivable: ' || coalesce(v_staff_name, ''),
            'currency',     coalesce(new.currency, 'SDG'),
            'function',     'management'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'amount',       new.amount,
            'debit_credit', 'CR',
            'description',  'Cash disbursed for salary advance',
            'currency',     coalesce(new.currency, 'SDG'),
            'function',     'management'
          )
        ),
        new.created_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('hr_salary_advances', new.id, 'advance_disbursed', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('hr_salary_advances', new.id, 'advance_disbursed', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_hr_salary_advances on public.hr_salary_advances;
create trigger acct_bridge_hr_salary_advances
  after insert on public.hr_salary_advances
  for each row execute function public.acct_trig_hr_salary_advances();

-- =============================================================================
-- PART F: TRIGGER FUNCTION — hr_salary_advance_recoveries
-- Fires on: INSERT (any recovery installment from payroll or manual)
-- Journal: DR 1200 Cash at Bank / CR 1520 Salary Advances Receivable
-- =============================================================================
create or replace function public.acct_trig_hr_salary_advance_recoveries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id   uuid;
  v_staff_name text;
  v_adv_user   uuid;
begin
  if tg_op = 'INSERT' and new.amount > 0 then
    -- Get user from parent advance
    select user_id into v_adv_user
      from public.hr_salary_advances where id = new.advance_id;
    if v_adv_user is not null then
      select coalesce(full_name, 'Unknown') into v_staff_name
        from public.profiles where id = v_adv_user;
    end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'hr_salary_advance_recoveries',
        new.id,
        'advance_recovered',
        coalesce(new.recovery_date::date, current_date),
        'Salary Advance Recovery — ' || coalesce(v_staff_name, '') ||
          case when new.payroll_period is not null then ' (' || new.payroll_period || ')' else '' end,
        'استرداد سلفة راتب — ' || coalesce(v_staff_name, ''),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1200',
            'amount',       new.amount,
            'debit_credit', 'DR',
            'description',  'Advance Recovery received',
            'currency',     'SDG',
            'function',     'management'
          ),
          jsonb_build_object(
            'account_code', '1520',
            'amount',       new.amount,
            'debit_credit', 'CR',
            'description',  'Clearing Salary Advance Receivable: ' || coalesce(v_staff_name, ''),
            'currency',     'SDG',
            'function',     'management'
          )
        ),
        null
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('hr_salary_advance_recoveries', new.id, 'advance_recovered', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('hr_salary_advance_recoveries', new.id, 'advance_recovered', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_hr_salary_advance_recoveries on public.hr_salary_advance_recoveries;
create trigger acct_bridge_hr_salary_advance_recoveries
  after insert on public.hr_salary_advance_recoveries
  for each row execute function public.acct_trig_hr_salary_advance_recoveries();

-- =============================================================================
-- PART G: TRIGGER FUNCTION — acct_grant_expenses
-- Fires on: INSERT (any grant expense recorded)
-- Journal: DR 5600 Grant Programme Expense / CR 2100 Accounts Payable
-- =============================================================================
create or replace function public.acct_trig_grant_expenses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id   uuid;
  v_grant_name text;
  v_grant_cur  text;
begin
  if tg_op = 'INSERT' and new.amount > 0 then
    select grant_name, coalesce(currency, 'USD')
      into v_grant_name, v_grant_cur
      from public.acct_grants where id = new.grant_id;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'acct_grant_expenses',
        new.id,
        'grant_expense_posted',
        coalesce(new.expense_date::date, current_date),
        'Grant Expense — ' || coalesce(v_grant_name, '') || ': ' || coalesce(new.description, ''),
        'مصروف منحة — ' || coalesce(v_grant_name, '') || ': ' || coalesce(new.description, ''),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '5600',
            'amount',       new.amount,
            'debit_credit', 'DR',
            'description',  'Grant Expense: ' || coalesce(new.description, ''),
            'currency',     coalesce(v_grant_cur, 'USD'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '2100',
            'amount',       new.amount,
            'debit_credit', 'CR',
            'description',  'Accounts Payable: ' || coalesce(v_grant_name, ''),
            'currency',     coalesce(v_grant_cur, 'USD'),
            'function',     'program'
          )
        ),
        new.created_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_grant_expenses', new.id, 'grant_expense_posted', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('acct_grant_expenses', new.id, 'grant_expense_posted', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_grant_expenses on public.acct_grant_expenses;
create trigger acct_bridge_grant_expenses
  after insert on public.acct_grant_expenses
  for each row execute function public.acct_trig_grant_expenses();

-- =============================================================================
-- PART H: RPC — run_period_close_allocation(p_period_id uuid)
-- Called from AccountingPeriodClose frontend after soft/hard close transition.
-- Creates cost allocation runs for all active rules in the period date range.
-- =============================================================================
create or replace function public.run_period_close_allocation(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_period      record;
  v_rule        record;
  v_run_id      uuid;
  v_journal_id  uuid;
  v_processed   int := 0;
  v_errors      int := 0;
  v_total_pct   numeric;
  v_tgt         record;
begin
  -- Auth check
  v_caller_role := (select role from public.profiles where id = auth.uid());
  if lower(coalesce(v_caller_role,'')) not in
     ('super_admin','superadmin','admin','finance','financialadmin','accountant') then
    raise exception 'Unauthorized: Finance or Admin role required' using errcode = '42501';
  end if;

  -- Load period
  select * into v_period from public.acct_fiscal_periods where id = p_period_id;
  if not found then
    raise exception 'Fiscal period % not found', p_period_id;
  end if;

  -- Loop through active allocation rules
  for v_rule in
    select r.*, b.pool_account_code, b.pool_amount
    from public.acct_cost_allocation_rules r
    left join (
      -- Sum driver amounts per rule from journal lines in period
      select jl.entry_id, jl.description, 1 as pool_amount, null::text as pool_account_code
      from public.acct_journal_lines jl
      join public.acct_journal_entries je on je.id = jl.entry_id
      where je.period_id = p_period_id
      limit 1
    ) b on true
    where r.is_active = true
    limit 200
  loop
    begin
      -- Validate targets sum to 100 %
      select coalesce(sum(weight_pct), 0) into v_total_pct
        from public.acct_cost_allocation_targets where rule_id = v_rule.id;

      if v_total_pct < 99.9 or v_total_pct > 100.1 then
        insert into public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        values
          ('acct_cost_allocation_rules', v_rule.id, 'period_close_allocation', 'skipped',
           'Targets do not sum to 100% (got ' || v_total_pct || '%). Skipped.');
        continue;
      end if;

      -- Create allocation run record
      insert into public.acct_allocation_runs
        (rule_id, period_id, run_date, status, notes, created_by)
      values
        (v_rule.id, p_period_id, current_date, 'posted',
         'Auto-run on period close', auth.uid())
      returning id into v_run_id;

      -- Build lines JSONB from targets
      declare
        v_lines jsonb := '[]'::jsonb;
        v_line  jsonb;
        v_acct  text;
        v_pct   numeric;
        v_amt   numeric := coalesce(v_rule.driver_amount, 0);
      begin
        -- Build one DR per target account
        for v_tgt in
          select t.target_account_code, t.weight_pct
            from public.acct_cost_allocation_targets t
           where t.rule_id = v_rule.id
           order by t.weight_pct desc
        loop
          v_line := jsonb_build_object(
            'account_code', v_tgt.target_account_code,
            'amount',       round(v_amt * v_tgt.weight_pct / 100.0, 2),
            'debit_credit', 'DR',
            'description',  v_rule.rule_name || ' allocation',
            'currency',     'SDG',
            'function',     'program'
          );
          v_lines := v_lines || jsonb_build_array(v_line);
        end loop;

        -- Single CR to source pool account
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_code', coalesce(v_rule.source_account_code, '5050'),
          'amount',       v_amt,
          'debit_credit', 'CR',
          'description',  v_rule.rule_name || ' — pool source',
          'currency',     'SDG',
          'function',     'program'
        ));

        if jsonb_array_length(v_lines) >= 2 then
          v_journal_id := public.acct_bridge_post_journal(
            'acct_allocation_runs',
            v_run_id,
            'period_close_allocation',
            v_period.end_date::date,
            'Period Close Allocation — ' || v_rule.rule_name,
            'توزيع التكاليف عند إغلاق الفترة — ' || v_rule.rule_name,
            v_lines,
            auth.uid()
          );

          update public.acct_allocation_runs
            set journal_entry_id = v_journal_id
          where id = v_run_id;

          insert into public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, journal_entry_id)
          values
            ('acct_allocation_runs', v_run_id, 'period_close_allocation', 'success', v_journal_id);

          v_processed := v_processed + 1;
        end if;
      end;

    exception when others then
      v_errors := v_errors + 1;
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('acct_cost_allocation_rules', v_rule.id, 'period_close_allocation', 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'period_id',  p_period_id,
    'processed',  v_processed,
    'errors',     v_errors,
    'status',     case when v_errors = 0 then 'ok' else 'partial' end
  );
end $$;

grant execute on function public.run_period_close_allocation(uuid) to authenticated;

comment on function public.run_period_close_allocation(uuid) is
  'Triggered from AccountingPeriodClose after a soft/hard-close transition. '
  'Runs all active cost allocation rules, posting journal entries for the closed period. '
  'Requires Finance or Admin role.';

-- =============================================================================
-- PART I: RPC — get_gl_bridge_log (convenient read with joins)
-- Returns bridge log entries enriched with journal entry reference number.
-- =============================================================================
create or replace function public.get_gl_bridge_log(
  p_source_table text  default null,
  p_status       text  default null,
  p_date_from    date  default null,
  p_date_to      date  default null,
  p_limit        int   default 500
)
returns table (
  id               uuid,
  source_table     text,
  source_id        uuid,
  event_type       text,
  status           text,
  journal_entry_id uuid,
  je_reference     text,
  je_description   text,
  error_message    text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.source_table,
    l.source_id,
    l.event_type,
    l.status,
    l.journal_entry_id,
    je.entry_no::text    as je_reference,
    je.description_en    as je_description,
    l.error_message,
    l.created_at
  from public.acct_gl_bridge_log l
  left join public.acct_journal_entries je on je.id = l.journal_entry_id
  where (p_source_table is null or l.source_table = p_source_table)
    and (p_status       is null or l.status       = p_status)
    and (p_date_from    is null or l.created_at::date >= p_date_from)
    and (p_date_to      is null or l.created_at::date <= p_date_to)
  order by l.created_at desc
  limit p_limit;
$$;

grant execute on function public.get_gl_bridge_log(text, text, date, date, int) to authenticated;

-- =============================================================================
-- PART J: Payroll Advance Deduction Integration
-- When a payroll_run_items row is inserted/updated and has salary_advance_deduction > 0,
-- auto-create a recovery entry in hr_salary_advance_recoveries.
-- This links payroll → salary advances automatically.
-- Guarded — skips gracefully if payroll_run_items table is not yet in pactdb.
-- =============================================================================
do $guard_pri$ begin
  if to_regclass('public.payroll_run_items') is not null then
    execute 'alter table public.payroll_run_items
      add column if not exists salary_advance_deduction numeric(14,2) default 0,
      add column if not exists salary_advance_ids        uuid[]       default ''{}''';
  else
    raise notice 'SKIP Part J: payroll_run_items not found — salary_advance columns not added. '
                 'Add them manually once HR payroll tables exist.';
  end if;
end $guard_pri$;

comment on column public.payroll_run_items.salary_advance_deduction is
  'Total salary advance recovery amount deducted from this payroll item. '
  'Auto-creates hr_salary_advance_recoveries entries when > 0.';

create or replace function public.acct_trig_payroll_advance_recovery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv_id  uuid;
  v_monthly numeric;
  v_period  text;
begin
  -- Only fire when salary_advance_deduction is set and > 0
  if tg_op = 'INSERT'
     and coalesce(new.salary_advance_deduction, 0) > 0
     and array_length(coalesce(new.salary_advance_ids, '{}'), 1) > 0 then

    -- Derive payroll period label from run
    select coalesce(period_label, to_char(period_start, 'YYYY-MM'))
      into v_period
      from public.payroll_runs where id = new.run_id;

    -- Insert a recovery entry for each advance in the array
    foreach v_adv_id in array new.salary_advance_ids loop
      -- Calculate per-advance share (equal split if multiple)
      v_monthly := round(
        new.salary_advance_deduction / array_length(new.salary_advance_ids, 1),
        2
      );

      insert into public.hr_salary_advance_recoveries
        (advance_id, recovery_date, amount, payroll_period, notes)
      values
        (v_adv_id, current_date, v_monthly, v_period,
         'Auto-deducted from payroll run ' || new.run_id::text)
      on conflict do nothing;

      -- Auto-check if advance is fully recovered
      update public.hr_salary_advances adv
        set status = case
              when (
                select coalesce(sum(r.amount), 0)
                  from public.hr_salary_advance_recoveries r
                 where r.advance_id = adv.id
              ) >= adv.amount then 'fully_recovered'
              else status
            end
      where id = v_adv_id and status = 'active';
    end loop;
  end if;
  return new;
end $$;

do $guard_trig$ begin
  if to_regclass('public.payroll_run_items') is not null then
    execute 'drop trigger if exists acct_payroll_advance_recovery on public.payroll_run_items';
    execute 'create trigger acct_payroll_advance_recovery
      after insert on public.payroll_run_items
      for each row execute function public.acct_trig_payroll_advance_recovery()';
    raise notice 'acct_payroll_advance_recovery trigger created on payroll_run_items.';
  else
    raise notice 'SKIP: payroll_run_items not found — acct_payroll_advance_recovery trigger not created. '
                 'Bind manually: CREATE TRIGGER acct_payroll_advance_recovery AFTER INSERT ON '
                 'public.payroll_run_items FOR EACH ROW EXECUTE FUNCTION '
                 'public.acct_trig_payroll_advance_recovery();';
  end if;
end $guard_trig$;

-- =============================================================================
-- PART K: Ensure acct_allocation_runs has journal_entry_id + source_account_code
--         and acct_cost_allocation_rules has driver_amount + source_account_code
-- =============================================================================
alter table public.acct_allocation_runs
  add column if not exists period_id uuid references public.acct_fiscal_periods(id),
  add column if not exists notes     text;

alter table public.acct_cost_allocation_rules
  add column if not exists driver_amount       numeric(20,4) default 0,
  add column if not exists source_account_code text,
  add column if not exists rule_name           text;

-- Back-fill rule_name from pool_name where not already set
-- (run_period_close_allocation references v_rule.rule_name)
update public.acct_cost_allocation_rules
  set rule_name = pool_name
  where rule_name is null and pool_name is not null;

-- =============================================================================
-- PART L: Summary view — GL Bridge Coverage Matrix
-- Shows which source modules have GL coverage and recent posting status.
-- =============================================================================
create or replace view public.acct_gl_bridge_coverage as
with source_counts as (
  select
    source_table,
    count(*)                                                     as total_events,
    count(*) filter (where status = 'success')                   as success_count,
    count(*) filter (where status = 'error')                     as error_count,
    count(*) filter (where status = 'skipped')                   as skipped_count,
    max(created_at)                                              as last_event_at,
    max(case when status = 'error' then created_at end)          as last_error_at
  from public.acct_gl_bridge_log
  group by source_table
)
select
  s.source_table,
  s.total_events,
  s.success_count,
  s.error_count,
  s.skipped_count,
  round(s.success_count::numeric / nullif(s.total_events, 0) * 100, 1) as success_pct,
  s.last_event_at,
  s.last_error_at,
  case
    when s.error_count > 0 then 'degraded'
    when s.success_count > 0 then 'healthy'
    else 'no_data'
  end as health_status
from source_counts s
order by s.last_event_at desc;

comment on view public.acct_gl_bridge_coverage is
  'Operational view showing GL bridge health per source module. '
  'Used by the GL Audit page to display coverage matrix.';

-- =============================================================================
-- RUNBOOK
-- =============================================================================
-- 1. Paste this entire file into Supabase SQL Editor → Run
-- 2. Verify: SELECT * FROM acct_gl_bridge_coverage; (should show existing modules)
-- 3. Verify new accounts: SELECT code, name_en FROM acct_accounts WHERE code IN ('1520','2350','5600','6200');
-- 4. Test EOSB bridge: SELECT accrue_eosb_for_period(to_char(now(),'YYYY-MM'));
--    Then: SELECT * FROM acct_gl_bridge_log WHERE source_table = 'eosb_accruals' ORDER BY created_at DESC;
-- 5. Test advance bridge: INSERT INTO hr_salary_advances (..., status='active', amount=1000, ...);
--    Then: SELECT * FROM acct_gl_bridge_log WHERE source_table = 'hr_salary_advances';
-- =============================================================================
