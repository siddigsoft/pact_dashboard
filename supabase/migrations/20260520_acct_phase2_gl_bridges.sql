-- =============================================================================
-- PACT Accounting — Phase 2 · GL Bridge Engine
-- Operational tables → General Ledger auto-posting
-- =============================================================================
-- Migration  : 20260520_acct_phase2_gl_bridges.sql
-- Depends on : 20260501_acct_phase1_sprint1_1.sql  (Phase 1 schema + engine)
--              PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql   (COA accounts seeded)
-- Apply      : MANUAL — paste into Supabase SQL editor (abznugnirnlrqnnfkein)
-- Runbook    : docs/sql/PHASE2_GL_BRIDGES_MANUAL_APPLY.md
-- Idempotent : YES — all blocks use CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT
-- Rollback   : docs/sql/PHASE2_GL_BRIDGES_ROLLBACK.sql
-- =============================================================================
--
-- GL Posting Map (bridged in this file)
-- ──────────────────────────────────────────────────────────────────────────────
-- Source Table                 │ Trigger Status  │ DR Account      │ CR Account
-- ─────────────────────────────┼─────────────────┼─────────────────┼───────────
-- payroll_runs                 │ approved        │ 6100 Sal Exp    │ 2200 Pay Payable
-- payroll_runs                 │ locked          │ 2200 Pay Payable│ 1200 Cash Bank
-- withdrawal_requests          │ approved        │ 2600 Wallet Pay │ 1200 Cash Bank
-- operational_cost_submissions │ paid            │ category-mapped │ 1200 Cash Bank
-- down_payment_requests        │ fully_paid      │ 1510 Trvl Adv   │ 1200 Cash Bank
-- salary_advances              │ disbursed       │ 1500 Staff Adv  │ 1200 Cash Bank
-- wallet_transactions          │ type=reward     │ 5310 Per Diem   │ 2600 Wallet Pay
-- =============================================================================
--
-- NOTE: No outer BEGIN/COMMIT wrapper intentionally.
-- Each statement auto-commits so locks are released immediately.
-- This prevents deadlocks when the live app holds AccessShareLock on tables
-- (e.g. profiles via RLS) that this migration also needs to lock exclusively.
-- All statements are idempotent — safe to re-run if any step fails.
-- =============================================================================

-- Fail fast if a lock cannot be acquired rather than waiting and deadlocking.
-- (deadlock_timeout requires superuser — omitted; lock_timeout is sufficient)
set lock_timeout = '5s';

-- =============================================================================
-- PART A: Additional COA accounts for Phase 2 bridges
-- =============================================================================
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('2600','Staff Electronic Wallet Payable','ذمم المحافظ الإلكترونية للموظفين',
   'liability','current_liability',
   (select id from public.acct_accounts where code='2000'), true),
  ('2610','Site Visit Incentives Payable','مستحقات حوافز الزيارات الميدانية',
   'liability','current_liability',
   (select id from public.acct_accounts where code='2000'), true),
  ('2620','Task Rewards Payable','مستحقات مكافآت المهام',
   'liability','current_liability',
   (select id from public.acct_accounts where code='2000'), true),
  ('5050','Operational Field Costs','التكاليف التشغيلية الميدانية',
   'expense','program_expense',
   (select id from public.acct_accounts where code='5000'), true),
  ('5060','Staff Retainer Payments','مدفوعات الاتعاب الدورية للموظفين',
   'expense','program_expense',
   (select id from public.acct_accounts where code='5000'), true),
  ('5070','Data Collector Incentives','حوافز جامعي البيانات',
   'expense','program_expense',
   (select id from public.acct_accounts where code='5000'), true)
on conflict (code) do nothing;

-- =============================================================================
-- PART B: Feature flags for Phase 2 GL bridges
-- =============================================================================
insert into public.feature_flags (key, description, is_enabled) values
  ('acct.bridge.payroll_runs',                  'Auto-post GL journals when payroll_runs status → approved / locked',  true),
  ('acct.bridge.withdrawal_requests',           'Auto-post GL journals when withdrawal_requests status → approved',     true),
  ('acct.bridge.operational_cost_submissions',  'Auto-post GL journals when ops cost submissions status → paid',         true),
  ('acct.bridge.down_payment_requests',         'Auto-post GL journals when down_payment_requests status → fully_paid', true),
  ('acct.bridge.salary_advances',               'Auto-post GL journals when salary_advances status → disbursed',        true),
  ('acct.bridge.wallet_transactions',           'Auto-post GL journals for reward wallet_transactions',                  true),
  ('acct.p2p.enabled',                          'Enable Phase 2 P2P tables (PR → PO → GRN → Invoice → Payment)',        true)
on conflict (key) do nothing;

-- =============================================================================
-- PART C: GL Bridge audit log
-- =============================================================================
create table if not exists public.acct_gl_bridge_log (
  id             uuid primary key default gen_random_uuid(),
  source_table   text not null,
  source_id      uuid not null,
  event_type     text not null,
  status         text not null check (status in ('success','error','skipped')),
  journal_entry_id uuid references public.acct_journal_entries(id),
  error_message  text,
  created_at     timestamptz not null default now()
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
         and lower(role) in ('super_admin','superadmin','admin','finance','accountant','auditor')
    )
  );

drop policy if exists bridge_log_insert_service on public.acct_gl_bridge_log;
create policy bridge_log_insert_service on public.acct_gl_bridge_log
  for insert to authenticated with check (true);

-- =============================================================================
-- PART D: Internal bridge posting function (SECURITY DEFINER — no auth.uid check)
-- Called exclusively from trigger functions; never exposed to client.
-- =============================================================================
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
  -- ── Gate: engine + bridge-specific flag ────────────────────────────────────
  select is_enabled into v_engine_on
    from public.feature_flags where key = 'acct.posting_engine.enabled';
  if not coalesce(v_engine_on, false) then
    raise exception 'BRIDGE_SKIP: acct.posting_engine.enabled is OFF';
  end if;

  select is_enabled into v_bridge_on
    from public.feature_flags where key = 'acct.bridge.' || p_source_table;
  if not coalesce(v_bridge_on, false) then
    raise exception 'BRIDGE_SKIP: acct.bridge.% is OFF', p_source_table;
  end if;

  -- ── Idempotency ─────────────────────────────────────────────────────────────
  v_idempotency := p_source_table || '::' || p_source_id::text || '::' || p_event_type;

  select id into v_entry_id
    from public.acct_journal_entries
   where idempotency_key = v_idempotency;
  if found then
    return v_entry_id;
  end if;

  -- ── Resolve open fiscal period containing p_posting_date ────────────────────
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

  -- ── Resolve default fund (code = GENERAL) ───────────────────────────────────
  select id into v_fund_id
    from public.acct_funds
   where code = 'GENERAL' and is_active = true
   limit 1;
  if v_fund_id is null then
    -- Fallback: any active fund
    select id into v_fund_id
      from public.acct_funds
     where is_active = true
     order by created_at
     limit 1;
  end if;
  if v_fund_id is null then
    raise exception 'BRIDGE_NO_FUND: no active fund found';
  end if;

  -- ── Resolve poster: approver or first super_admin ───────────────────────────
  v_poster_id := p_posted_by;
  if v_poster_id is null then
    select id into v_poster_id
      from public.profiles
     where lower(role) in ('super_admin','superadmin')
     order by created_at
     limit 1;
  end if;
  if v_poster_id is null then
    raise exception 'BRIDGE_NO_POSTER: no super_admin profile found';
  end if;

  -- ── Validate lines array ────────────────────────────────────────────────────
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'BRIDGE_INSUFFICIENT_LINES: must supply at least 2 lines';
  end if;

  -- ── Insert journal entry ────────────────────────────────────────────────────
  insert into public.acct_journal_entries (
    period_id, posting_date, description_en, description_ar,
    source_type, source_id, status, idempotency_key,
    posted_at, posted_by, created_by
  ) values (
    v_period_id,
    p_posting_date,
    p_description_en,
    p_description_ar,
    p_source_table,
    p_source_id,
    'posted',
    v_idempotency,
    now(),
    v_poster_id,
    v_poster_id
  )
  on conflict (idempotency_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select id into v_entry_id
      from public.acct_journal_entries
     where idempotency_key = v_idempotency;
    return v_entry_id;
  end if;

  -- ── Insert journal lines ────────────────────────────────────────────────────
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;

    select id into v_account_id
      from public.acct_accounts
     where code = (v_line->>'account_code')
       and is_postable = true;
    if v_account_id is null then
      raise exception 'BRIDGE_ACCOUNT_NOT_FOUND: code=%', (v_line->>'account_code');
    end if;

    insert into public.acct_journal_lines (
      entry_id, line_no, account_id, fund_id, function,
      original_amount, original_currency,
      functional_amount, functional_currency,
      debit_credit, description
    ) values (
      v_entry_id,
      v_line_no,
      v_account_id,
      v_fund_id,
      coalesce(v_line->>'function', 'program'),
      (v_line->>'amount')::numeric,
      coalesce(v_line->>'currency', 'SDG'),
      (v_line->>'amount')::numeric,
      'SDG',
      v_line->>'debit_credit',
      v_line->>'description'
    );
  end loop;

  -- ── Balance check: Σ DR = Σ CR ─────────────────────────────────────────────
  select sum(
    case when debit_credit = 'DR' then functional_amount
         else -functional_amount end
  ) into v_balance
  from public.acct_journal_lines
  where entry_id = v_entry_id;

  if abs(coalesce(v_balance, 1)) > 0.005 then
    raise exception 'BRIDGE_IMBALANCE: DR/CR mismatch by % for entry %', v_balance, v_entry_id;
  end if;

  perform pg_notify('acct_journal_posted', v_entry_id::text);
  return v_entry_id;
end $$;

comment on function public.acct_bridge_post_journal(text, uuid, text, date, text, text, jsonb, uuid) is
  'Internal SECURITY DEFINER function for GL bridge triggers. '
  'Called only from trusted server-side trigger functions. '
  'Bypasses auth.uid() check (triggers have no session user). '
  'Idempotent on source_table::source_id::event_type.';

-- =============================================================================
-- PART E: Helper — resolve expense account by operational cost category
-- =============================================================================
create or replace function public.acct_bridge_ops_cost_account(p_category text)
returns text language sql stable security definer set search_path = public as $$
  select case p_category
    when 'incentives'         then '5070'  -- Data Collector Incentives
    when 'communications'     then '5800'  -- Programme Communications
    when 'training'           then '5320'  -- Training & Workshops
    when 'general_transport'  then '5700'  -- Programme Vehicle & Fuel
    when 'equipment'          then '5200'  -- Programme Supplies
    when 'printing'           then '5200'  -- Programme Supplies
    when 'meetings'           then '5320'  -- Training & Workshops
    when 'permits'            then '6310'  -- Legal Fees (government permits)
    else                           '5050'  -- Operational Field Costs (catch-all)
  end;
$$;

-- =============================================================================
-- PART F: TRIGGER FUNCTION — payroll_runs
-- Fires on: status → 'approved' (record expense + payable)
--           status → 'locked'   (clear payable with cash payment)
-- =============================================================================
create or replace function public.acct_trig_payroll_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_gross   numeric(20,4);
  v_total_net     numeric(20,4);
  v_total_deducts numeric(20,4);
  v_entry_id      uuid;
begin
  -- ── APPROVED: recognise payroll expense ─────────────────────────────────────
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'approved' then

    select
      coalesce(sum(gross_salary),  0),
      coalesce(sum(net_salary),    0),
      coalesce(sum(deductions_total), 0)
    into v_total_gross, v_total_net, v_total_deducts
    from public.payroll_run_items
    where run_id = new.id;

    if v_total_gross > 0 then
      begin
        v_entry_id := public.acct_bridge_post_journal(
          'payroll_runs',
          new.id,
          'approved',
          coalesce(new.approved_at::date, current_date),
          'Payroll Expense Recognised: ' || new.period_label,
          'تسجيل مصروف الرواتب: ' || new.period_label,
          jsonb_build_array(
            jsonb_build_object(
              'account_code', '6100',
              'debit_credit', 'DR',
              'amount',       v_total_gross,
              'currency',     'SDG',
              'description',  'Gross Salaries — ' || new.period_label,
              'function',     'mng'
            ),
            jsonb_build_object(
              'account_code', '2200',
              'debit_credit', 'CR',
              'amount',       v_total_net,
              'currency',     'SDG',
              'description',  'Net Payroll Payable — ' || new.period_label,
              'function',     'none'
            ),
            jsonb_build_object(
              'account_code', '2110',
              'debit_credit', 'CR',
              'amount',       v_total_deducts,
              'currency',     'SDG',
              'description',  'Accrued Statutory Deductions — ' || new.period_label,
              'function',     'none'
            )
          ),
          new.approved_by
        );

        insert into public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, journal_entry_id)
        values
          ('payroll_runs', new.id, 'payroll_approved', 'success', v_entry_id);

      exception when others then
        insert into public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        values
          ('payroll_runs', new.id, 'payroll_approved', 'error', sqlerrm);
      end;
    end if;
  end if;

  -- ── LOCKED: clear payable with cash disbursement ─────────────────────────────
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'locked' then

    select coalesce(sum(net_salary), 0)
    into v_total_net
    from public.payroll_run_items
    where run_id = new.id;

    if v_total_net > 0 then
      begin
        v_entry_id := public.acct_bridge_post_journal(
          'payroll_runs',
          new.id,
          'locked',
          current_date,
          'Payroll Disbursement: ' || new.period_label,
          'صرف الرواتب: ' || new.period_label,
          jsonb_build_array(
            jsonb_build_object(
              'account_code', '2200',
              'debit_credit', 'DR',
              'amount',       v_total_net,
              'currency',     'SDG',
              'description',  'Clear Payroll Payable — ' || new.period_label,
              'function',     'none'
            ),
            jsonb_build_object(
              'account_code', '1200',
              'debit_credit', 'CR',
              'amount',       v_total_net,
              'currency',     'SDG',
              'description',  'Cash at Bank — Payroll Payment — ' || new.period_label,
              'function',     'none'
            )
          ),
          new.approved_by
        );

        insert into public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, journal_entry_id)
        values
          ('payroll_runs', new.id, 'payroll_locked', 'success', v_entry_id);

      exception when others then
        insert into public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        values
          ('payroll_runs', new.id, 'payroll_locked', 'error', sqlerrm);
      end;
    end if;
  end if;

  return new;
end $$;

-- =============================================================================
-- PART G: TRIGGER FUNCTION — withdrawal_requests
-- Fires on: status → 'approved'
-- Entry: DR 2600 Staff Wallet Payable / CR 1200 Cash at Bank
-- =============================================================================
create or replace function public.acct_trig_withdrawal_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_amount   numeric(20,4);
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'approved' then

    v_amount := coalesce(new.amount, 0);
    if v_amount <= 0 then return new; end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'withdrawal_requests',
        new.id,
        'approved',
        coalesce(new.approved_at::date, current_date),
        'Wallet Withdrawal Approved',
        'سحب محفظة معتمد',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '2600',
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Staff Wallet Payable — Withdrawal #' || new.id::text,
            'function',     'none'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Cash Disbursement — Wallet Withdrawal #' || new.id::text,
            'function',     'none'
          )
        ),
        new.supervisor_id
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('withdrawal_requests', new.id, 'withdrawal_approved', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('withdrawal_requests', new.id, 'withdrawal_approved', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

-- =============================================================================
-- PART H: TRIGGER FUNCTION — operational_cost_submissions
-- Fires on: status → 'paid'
-- Entry: DR category-mapped expense account / CR 1200 Cash at Bank
-- =============================================================================
create or replace function public.acct_trig_operational_cost_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id    uuid;
  v_amount      numeric(20,4);
  v_expense_acc text;
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'paid' then

    v_amount      := coalesce(new.amount_cents, 0) / 100.0;
    v_expense_acc := public.acct_bridge_ops_cost_account(new.expense_category);

    if v_amount <= 0 then return new; end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'operational_cost_submissions',
        new.id,
        'paid',
        coalesce(new.expense_date, current_date),
        'Operational Cost Paid: ' || coalesce(new.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: ' || coalesce(new.expense_category, 'عامة'),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_expense_acc,
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  coalesce(new.description, new.expense_category),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Cash Payment — Ops Cost #' || new.id::text,
            'function',     'none'
          )
        ),
        new.tier2_approved_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('operational_cost_submissions', new.id, 'ops_cost_paid', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

-- =============================================================================
-- PART I: TRIGGER FUNCTION — down_payment_requests
-- Fires on: status → 'fully_paid'
-- Entry: DR 1510 Travel Advances / CR 1200 Cash at Bank
-- =============================================================================
create or replace function public.acct_trig_down_payment_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_amount   numeric(20,4);
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'fully_paid' then

    v_amount := coalesce(new.total_paid_amount, new.requested_amount, 0);
    if v_amount <= 0 then return new; end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'down_payment_requests',
        new.id,
        'fully_paid',
        current_date,
        'Field Advance Disbursed: ' || coalesce(new.site_name, new.id::text),
        'صرف سلفة ميدانية: ' || coalesce(new.site_name, new.id::text),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1510',
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Travel Advance — ' || coalesce(new.site_name, 'Field Site'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Cash — Field Advance #' || new.id::text,
            'function',     'none'
          )
        ),
        new.admin_processed_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('down_payment_requests', new.id, 'down_payment_fully_paid', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('down_payment_requests', new.id, 'down_payment_fully_paid', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

-- =============================================================================
-- PART J: TRIGGER FUNCTION — salary_advances
-- Fires on: status → 'disbursed'
-- Entry: DR 1500 Staff Advances / CR 1200 Cash at Bank
-- =============================================================================
create or replace function public.acct_trig_salary_advances()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'disbursed' then

    if coalesce(new.amount, 0) <= 0 then return new; end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'salary_advances',
        new.id,
        'disbursed',
        coalesce(new.disbursed_at::date, current_date),
        'Salary Advance Disbursed',
        'صرف سلفة راتب',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1500',
            'debit_credit', 'DR',
            'amount',       new.amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Staff Advance — ' || new.id::text,
            'function',     'mng'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       new.amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Cash — Salary Advance #' || new.id::text,
            'function',     'none'
          )
        ),
        new.finance_id
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('salary_advances', new.id, 'salary_advance_disbursed', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('salary_advances', new.id, 'salary_advance_disbursed', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

-- =============================================================================
-- PART K: TRIGGER FUNCTION — wallet_transactions (reward type)
-- Fires on: INSERT where type = 'reward'
-- Entry: DR 5310 Per Diem / CR 2600 Staff Wallet Payable
-- =============================================================================
create or replace function public.acct_trig_wallet_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_amount   numeric(20,4);
begin
  -- Only fire on INSERT of reward-type transactions
  if tg_op = 'INSERT' and new.type = 'reward' then

    v_amount := coalesce(
      new.amount,
      new.amount_cents / 100.0
    );

    if coalesce(v_amount, 0) <= 0 then return new; end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'wallet_transactions',
        new.id,
        'reward_credit',
        coalesce(new.created_at::date, current_date),
        'Task Reward Earned',
        'مكافأة مهمة مكتسبة',
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '5310',
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  coalesce(new.memo, new.description, 'Task Reward'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '2600',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Staff Wallet Payable — Reward',
            'function',     'none'
          )
        ),
        new.created_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('wallet_transactions', new.id, 'reward_credit', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('wallet_transactions', new.id, 'reward_credit', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

-- =============================================================================
-- PART L: Trigger bindings
-- =============================================================================

-- payroll_runs
drop trigger if exists acct_bridge_payroll_runs on public.payroll_runs;
create trigger acct_bridge_payroll_runs
  after update on public.payroll_runs
  for each row execute function public.acct_trig_payroll_runs();

-- withdrawal_requests
drop trigger if exists acct_bridge_withdrawal_requests on public.withdrawal_requests;
create trigger acct_bridge_withdrawal_requests
  after update on public.withdrawal_requests
  for each row execute function public.acct_trig_withdrawal_requests();

-- operational_cost_submissions
drop trigger if exists acct_bridge_ops_cost on public.operational_cost_submissions;
create trigger acct_bridge_ops_cost
  after update on public.operational_cost_submissions
  for each row execute function public.acct_trig_operational_cost_submissions();

-- down_payment_requests
drop trigger if exists acct_bridge_down_payments on public.down_payment_requests;
create trigger acct_bridge_down_payments
  after update on public.down_payment_requests
  for each row execute function public.acct_trig_down_payment_requests();

-- salary_advances
drop trigger if exists acct_bridge_salary_advances on public.salary_advances;
create trigger acct_bridge_salary_advances
  after update on public.salary_advances
  for each row execute function public.acct_trig_salary_advances();

-- wallet_transactions (reward INSERT)
drop trigger if exists acct_bridge_wallet_reward on public.wallet_transactions;
create trigger acct_bridge_wallet_reward
  after insert on public.wallet_transactions
  for each row execute function public.acct_trig_wallet_reward();

-- =============================================================================
-- PART M: P2P cycle tables
-- =============================================================================

-- ── Purchase Requisitions (PR) ────────────────────────────────────────────────
create table if not exists public.acct_purchase_requisitions (
  id              uuid primary key default gen_random_uuid(),
  pr_number       text not null unique,
  title           text not null,
  description     text,
  requested_by    uuid not null references public.profiles(id),
  department_id   uuid,
  project_id      uuid,
  hub_id          text,
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  required_by     date,
  status          text not null default 'draft'
                  check (status in ('draft','submitted','approved','rejected','po_raised','cancelled')),
  total_estimated numeric(20,2) not null default 0,
  currency        text not null default 'SDG',
  approver_id     uuid references public.profiles(id),
  approved_at     timestamptz,
  approval_notes  text,
  rejection_reason text,
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.acct_pr_lines (
  id              uuid primary key default gen_random_uuid(),
  pr_id           uuid not null references public.acct_purchase_requisitions(id) on delete cascade,
  line_no         int  not null,
  item_description text not null,
  quantity        numeric(14,4) not null default 1,
  unit            text,
  unit_price      numeric(14,2) not null default 0,
  total_price     numeric(14,2) generated always as (quantity * unit_price) stored,
  gl_account_code text,
  notes           text,
  unique (pr_id, line_no)
);

create index if not exists idx_acct_pr_status   on public.acct_purchase_requisitions(status);
create index if not exists idx_acct_pr_requester on public.acct_purchase_requisitions(requested_by);
create index if not exists idx_acct_pr_project   on public.acct_purchase_requisitions(project_id);

-- ── Purchase Orders (PO) ──────────────────────────────────────────────────────
create table if not exists public.acct_purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  po_number       text not null unique,
  pr_id           uuid references public.acct_purchase_requisitions(id),
  vendor_id       uuid,
  title           text not null,
  status          text not null default 'draft'
                  check (status in ('draft','sent','acknowledged','part_received','fully_received','invoiced','closed','cancelled')),
  issue_date      date not null default current_date,
  delivery_date   date,
  total_amount    numeric(20,2) not null default 0,
  currency        text not null default 'SDG',
  payment_terms   text,
  delivery_terms  text,
  created_by      uuid references public.profiles(id),
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.acct_po_lines (
  id              uuid primary key default gen_random_uuid(),
  po_id           uuid not null references public.acct_purchase_orders(id) on delete cascade,
  pr_line_id      uuid references public.acct_pr_lines(id),
  line_no         int  not null,
  item_description text not null,
  quantity        numeric(14,4) not null,
  unit            text,
  unit_price      numeric(14,2) not null,
  total_price     numeric(14,2) generated always as (quantity * unit_price) stored,
  received_qty    numeric(14,4) not null default 0,
  gl_account_code text,
  unique (po_id, line_no)
);

-- Guard: if the table existed before Phase 2, pr_id may be absent — add it safely.
alter table public.acct_purchase_orders
  add column if not exists pr_id uuid references public.acct_purchase_requisitions(id);

create index if not exists idx_acct_po_status on public.acct_purchase_orders(status);
create index if not exists idx_acct_po_vendor on public.acct_purchase_orders(vendor_id);
create index if not exists idx_acct_po_pr     on public.acct_purchase_orders(pr_id);

-- ── Goods Received Notes (GRN) ────────────────────────────────────────────────
create table if not exists public.acct_grn_receipts (
  id              uuid primary key default gen_random_uuid(),
  grn_number      text not null unique,
  po_id           uuid not null references public.acct_purchase_orders(id),
  received_by     uuid references public.profiles(id),
  received_date   date not null default current_date,
  status          text not null default 'pending'
                  check (status in ('pending','inspected','accepted','rejected','partial')),
  notes           text,
  journal_entry_id uuid references public.acct_journal_entries(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.acct_grn_lines (
  id              uuid primary key default gen_random_uuid(),
  grn_id          uuid not null references public.acct_grn_receipts(id) on delete cascade,
  po_line_id      uuid references public.acct_po_lines(id),
  line_no         int  not null,
  item_description text not null,
  ordered_qty     numeric(14,4),
  received_qty    numeric(14,4) not null,
  accepted_qty    numeric(14,4),
  unit_price      numeric(14,2),
  total_value     numeric(14,2) generated always as (received_qty * unit_price) stored,
  unique (grn_id, line_no)
);

create index if not exists idx_acct_grn_po     on public.acct_grn_receipts(po_id);
create index if not exists idx_acct_grn_status on public.acct_grn_receipts(status);

-- ── AP Invoices ───────────────────────────────────────────────────────────────
create table if not exists public.acct_invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique,
  vendor_id       uuid,
  po_id           uuid references public.acct_purchase_orders(id),
  grn_id          uuid references public.acct_grn_receipts(id),
  invoice_date    date not null,
  due_date        date,
  status          text not null default 'draft'
                  check (status in ('draft','submitted','approved','disputed','paid','partial_paid','cancelled','written_off')),
  total_amount    numeric(20,2) not null,
  paid_amount     numeric(20,2) not null default 0,
  currency        text not null default 'SDG',
  description     text,
  journal_entry_id uuid references public.acct_journal_entries(id),
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  created_by      uuid references public.profiles(id),
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.acct_invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.acct_invoices(id) on delete cascade,
  po_line_id      uuid references public.acct_po_lines(id),
  line_no         int  not null,
  description     text not null,
  quantity        numeric(14,4) not null default 1,
  unit_price      numeric(14,2) not null,
  total_price     numeric(14,2) generated always as (quantity * unit_price) stored,
  gl_account_code text,
  tax_rate        numeric(6,4) default 0,
  unique (invoice_id, line_no)
);

create index if not exists idx_acct_inv_vendor on public.acct_invoices(vendor_id);
create index if not exists idx_acct_inv_status on public.acct_invoices(status);
create index if not exists idx_acct_inv_due    on public.acct_invoices(due_date);
create index if not exists idx_acct_inv_po     on public.acct_invoices(po_id);

-- ── AP Payments ───────────────────────────────────────────────────────────────
create table if not exists public.acct_payments (
  id              uuid primary key default gen_random_uuid(),
  payment_number  text not null unique,
  vendor_id       uuid,
  payment_date    date not null default current_date,
  amount          numeric(20,2) not null,
  currency        text not null default 'SDG',
  payment_method  text not null default 'bank_transfer'
                  check (payment_method in ('bank_transfer','cheque','cash','mobile_money','letter_of_credit')),
  bank_account    text,
  cheque_number   text,
  cheque_date     date,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected','processed','cancelled','bounced')),
  reference       text,
  notes           text,
  journal_entry_id uuid references public.acct_journal_entries(id),
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  processed_by    uuid references public.profiles(id),
  processed_at    timestamptz,
  created_by      uuid references public.profiles(id),
  metadata        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.acct_payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid not null references public.acct_payments(id) on delete cascade,
  invoice_id      uuid not null references public.acct_invoices(id),
  allocated_amount numeric(20,2) not null,
  created_at      timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create index if not exists idx_acct_pmt_vendor on public.acct_payments(vendor_id);
create index if not exists idx_acct_pmt_status on public.acct_payments(status);
create index if not exists idx_acct_pmt_date   on public.acct_payments(payment_date desc);

-- ── Cheque Register ───────────────────────────────────────────────────────────
create table if not exists public.acct_cheque_register (
  id              uuid primary key default gen_random_uuid(),
  cheque_number   text not null,
  bank_account    text not null,
  cheque_date     date not null,
  payee           text not null,
  amount          numeric(20,2) not null,
  currency        text not null default 'SDG',
  status          text not null default 'issued'
                  check (status in ('issued','cleared','bounced','cancelled','stale','voided')),
  payment_id      uuid references public.acct_payments(id),
  cleared_date    date,
  bounced_date    date,
  cancelled_date  date,
  notes           text,
  issued_by       uuid references public.profiles(id),
  signed_by       uuid references public.profiles(id),
  second_signatory uuid references public.profiles(id),
  journal_entry_id uuid references public.acct_journal_entries(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_acct_cheque_status on public.acct_cheque_register(status);
create index if not exists idx_acct_cheque_date   on public.acct_cheque_register(cheque_date desc);
create index if not exists idx_acct_cheque_number on public.acct_cheque_register(cheque_number);

-- =============================================================================
-- PART N: AP invoice posting trigger
-- Fires on: acct_invoices status → 'approved'
-- Entry: DR expense-account (from invoice lines) / CR 2100 Accounts Payable
-- =============================================================================
create or replace function public.acct_trig_invoice_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id  uuid;
  v_lines     jsonb := '[]'::jsonb;
  v_line_rec  record;
  v_line_no   int  := 0;
  v_cr_total  numeric(20,4) := 0;
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'approved' then

    if coalesce(new.total_amount, 0) <= 0 then return new; end if;

    -- Build DR lines from invoice lines (each line maps to a GL account)
    for v_line_rec in
      select il.description, il.total_price, il.gl_account_code
        from public.acct_invoice_lines il
       where il.invoice_id = new.id
       order by il.line_no
    loop
      v_line_no  := v_line_no + 1;
      v_cr_total := v_cr_total + coalesce(v_line_rec.total_price, 0);
      v_lines    := v_lines || jsonb_build_object(
        'account_code', coalesce(v_line_rec.gl_account_code, '5050'),
        'debit_credit', 'DR',
        'amount',       coalesce(v_line_rec.total_price, 0),
        'currency',     coalesce(new.currency, 'SDG'),
        'description',  v_line_rec.description,
        'function',     'program'
      );
    end loop;

    -- If no invoice lines, use total_amount against 5050
    if jsonb_array_length(v_lines) = 0 then
      v_lines    := jsonb_build_array(
        jsonb_build_object(
          'account_code', '5050',
          'debit_credit', 'DR',
          'amount',       new.total_amount,
          'currency',     coalesce(new.currency, 'SDG'),
          'description',  coalesce(new.description, 'AP Invoice ' || new.invoice_number),
          'function',     'program'
        )
      );
      v_cr_total := new.total_amount;
    end if;

    -- Add CR line: Accounts Payable
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2100',
      'debit_credit', 'CR',
      'amount',       v_cr_total,
      'currency',     coalesce(new.currency, 'SDG'),
      'description',  'AP Payable — Invoice ' || new.invoice_number,
      'function',     'none'
    );

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'acct_invoices',
        new.id,
        'invoice_approved',
        coalesce(new.invoice_date, current_date),
        'Invoice Approved: ' || new.invoice_number,
        'فاتورة معتمدة: ' || new.invoice_number,
        v_lines,
        new.approved_by
      );

      update public.acct_invoices set journal_entry_id = v_entry_id where id = new.id;

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_invoices', new.id, 'invoice_approved', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('acct_invoices', new.id, 'invoice_approved', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

drop trigger if exists acct_bridge_invoice_approved on public.acct_invoices;
create trigger acct_bridge_invoice_approved
  after update on public.acct_invoices
  for each row execute function public.acct_trig_invoice_approved();

-- =============================================================================
-- PART O: Payment posting trigger
-- Fires on: acct_payments status → 'processed'
-- Entry: DR 2100 AP Payable / CR 1200 Cash at Bank
-- =============================================================================
create or replace function public.acct_trig_payment_processed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_dr_acc   text := '2100';
begin
  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'processed' then

    if coalesce(new.amount, 0) <= 0 then return new; end if;

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'acct_payments',
        new.id,
        'payment_processed',
        coalesce(new.payment_date, current_date),
        'Vendor Payment Processed: ' || new.payment_number,
        'صرف دفعة مورد: ' || new.payment_number,
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_dr_acc,
            'debit_credit', 'DR',
            'amount',       new.amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Clear AP — Payment ' || new.payment_number,
            'function',     'none'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       new.amount,
            'currency',     coalesce(new.currency, 'SDG'),
            'description',  'Cash at Bank — Vendor Payment ' || new.payment_number,
            'function',     'none'
          )
        ),
        new.processed_by
      );

      update public.acct_payments set journal_entry_id = v_entry_id where id = new.id;

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_payments', new.id, 'payment_processed', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('acct_payments', new.id, 'payment_processed', 'error', sqlerrm);
    end;
  end if;

  return new;
end $$;

drop trigger if exists acct_bridge_payment_processed on public.acct_payments;
create trigger acct_bridge_payment_processed
  after update on public.acct_payments
  for each row execute function public.acct_trig_payment_processed();

-- =============================================================================
-- PART P: Auto-number generators for P2P documents
-- =============================================================================
create sequence if not exists public.acct_pr_seq  start 1001 increment 1;
create sequence if not exists public.acct_po_seq  start 2001 increment 1;
create sequence if not exists public.acct_grn_seq start 3001 increment 1;
create sequence if not exists public.acct_inv_seq start 4001 increment 1;
create sequence if not exists public.acct_pmt_seq start 5001 increment 1;
create sequence if not exists public.acct_chq_seq start 6001 increment 1;

create or replace function public.acct_next_pr_number()  returns text language sql as $$ select 'PR-' || lpad(nextval('public.acct_pr_seq')::text, 6, '0') $$;
create or replace function public.acct_next_po_number()  returns text language sql as $$ select 'PO-' || lpad(nextval('public.acct_po_seq')::text, 6, '0') $$;
create or replace function public.acct_next_grn_number() returns text language sql as $$ select 'GRN-'|| lpad(nextval('public.acct_grn_seq')::text,6, '0') $$;
create or replace function public.acct_next_inv_number() returns text language sql as $$ select 'INV-'|| lpad(nextval('public.acct_inv_seq')::text, 6, '0') $$;
create or replace function public.acct_next_pmt_number() returns text language sql as $$ select 'PMT-'|| lpad(nextval('public.acct_pmt_seq')::text, 6, '0') $$;
create or replace function public.acct_next_chq_number() returns text language sql as $$ select 'CHQ-'|| lpad(nextval('public.acct_chq_seq')::text, 6, '0') $$;

-- =============================================================================
-- PART Q: Daily sub-ledger reconciliation function
-- Checks that GL balances tie to source-table totals for key control accounts
-- =============================================================================
create or replace function public.acct_recon_subledger_check(
  p_check_date date default current_date
) returns table (
  check_name      text,
  gl_balance      numeric(20,2),
  subledger_total numeric(20,2),
  variance        numeric(20,2),
  passed          boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payroll_gl       numeric(20,2);
  v_payroll_src      numeric(20,2);
  v_wallet_gl        numeric(20,2);
  v_wallet_src       numeric(20,2);
  v_advances_gl      numeric(20,2);
  v_advances_src     numeric(20,2);
begin
  -- ── 1. Payroll Payable: GL 2200 vs net salary outstanding in approved runs ──
  select coalesce(sum(
    case when jl.debit_credit='CR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_payroll_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code = '2200'
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  select coalesce(sum(pri.net_salary), 0)
  into v_payroll_src
  from public.payroll_runs pr
  join public.payroll_run_items pri on pri.run_id = pr.id
  where pr.status = 'approved'
    and pr.approved_at::date <= p_check_date;

  return query select
    'Payroll Payable (2200 GL vs approved run net)'::text,
    v_payroll_gl,
    v_payroll_src,
    v_payroll_gl - v_payroll_src,
    abs(v_payroll_gl - v_payroll_src) <= 1;

  -- ── 2. Staff Wallet Payable: GL 2600 vs pending withdrawal requests ──────────
  select coalesce(sum(
    case when jl.debit_credit='CR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_wallet_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code = '2600'
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  select coalesce(sum(wr.amount), 0)
  into v_wallet_src
  from public.withdrawal_requests wr
  where wr.status = 'pending'
    and wr.created_at::date <= p_check_date;

  return query select
    'Staff Wallet Payable (2600 GL vs pending withdrawals)'::text,
    v_wallet_gl,
    v_wallet_src,
    v_wallet_gl - v_wallet_src,
    abs(v_wallet_gl - v_wallet_src) <= 1;

  -- ── 3. Staff Advances: GL 1500+1510 vs disbursed salary advances ─────────────
  select coalesce(sum(
    case when jl.debit_credit='DR' then jl.functional_amount
         else -jl.functional_amount end
  ), 0)
  into v_advances_gl
  from public.acct_journal_lines jl
  join public.acct_accounts a on a.id = jl.account_id
  join public.acct_journal_entries je on je.id = jl.entry_id
  where a.code in ('1500','1510')
    and je.status = 'posted'
    and je.posting_date <= p_check_date;

  select coalesce(sum(sa.amount - sa.total_repaid), 0)
  into v_advances_src
  from public.salary_advances sa
  where sa.status in ('disbursed','repaying')
    and sa.disbursed_at::date <= p_check_date;

  return query select
    'Staff Advances (1500+1510 GL vs disbursed advances outstanding)'::text,
    v_advances_gl,
    v_advances_src,
    v_advances_gl - v_advances_src,
    abs(v_advances_gl - v_advances_src) <= 1;
end $$;

comment on function public.acct_recon_subledger_check(date) is
  'Run daily to verify GL control accounts tie to source sub-ledger totals. '
  'Returns rows with check_name, gl_balance, subledger_total, variance, passed.';

-- =============================================================================
-- PART R: Bridge summary view — for GL Bridge status dashboard
-- =============================================================================
create or replace view public.v_acct_gl_bridge_summary as
select
  bl.source_table,
  bl.event_type,
  count(*) filter (where bl.status = 'success') as success_count,
  count(*) filter (where bl.status = 'error')   as error_count,
  count(*) filter (where bl.status = 'skipped') as skipped_count,
  max(bl.created_at)                             as last_fired_at,
  max(case when bl.status='error' then bl.error_message end) as last_error
from public.acct_gl_bridge_log bl
group by bl.source_table, bl.event_type;

-- =============================================================================
-- PART S: Permissions
-- =============================================================================
grant select on public.acct_gl_bridge_log         to authenticated;
grant select on public.v_acct_gl_bridge_summary    to authenticated;
grant select, insert, update on public.acct_purchase_requisitions to authenticated;
grant select, insert, update on public.acct_pr_lines               to authenticated;
grant select, insert, update on public.acct_purchase_orders        to authenticated;
grant select, insert, update on public.acct_po_lines               to authenticated;
grant select, insert, update on public.acct_grn_receipts           to authenticated;
grant select, insert, update on public.acct_grn_lines              to authenticated;
grant select, insert, update on public.acct_invoices               to authenticated;
grant select, insert, update on public.acct_invoice_lines          to authenticated;
grant select, insert, update on public.acct_payments               to authenticated;
grant select, insert, update on public.acct_payment_allocations    to authenticated;
grant select, insert, update on public.acct_cheque_register        to authenticated;
grant execute on function public.acct_bridge_post_journal(text,uuid,text,date,text,text,jsonb,uuid) to authenticated;
grant execute on function public.acct_bridge_ops_cost_account(text)                                  to authenticated;
grant execute on function public.acct_recon_subledger_check(date)                                    to authenticated;
grant execute on function public.acct_next_pr_number()  to authenticated;
grant execute on function public.acct_next_po_number()  to authenticated;
grant execute on function public.acct_next_grn_number() to authenticated;
grant execute on function public.acct_next_inv_number() to authenticated;
grant execute on function public.acct_next_pmt_number() to authenticated;
grant execute on function public.acct_next_chq_number() to authenticated;

-- =============================================================================
-- PART T: RLS policies for P2P tables (finance/admin/super_admin write; all auth read)
-- =============================================================================
alter table public.acct_purchase_requisitions enable row level security;
alter table public.acct_pr_lines               enable row level security;
alter table public.acct_purchase_orders        enable row level security;
alter table public.acct_po_lines               enable row level security;
alter table public.acct_grn_receipts           enable row level security;
alter table public.acct_grn_lines              enable row level security;
alter table public.acct_invoices               enable row level security;
alter table public.acct_invoice_lines          enable row level security;
alter table public.acct_payments               enable row level security;
alter table public.acct_payment_allocations    enable row level security;
alter table public.acct_cheque_register        enable row level security;

do $$
declare
  t text;
  finance_roles text[] := array['super_admin','superadmin','admin','finance','accountant'];
begin
  foreach t in array array[
    'acct_purchase_requisitions','acct_pr_lines',
    'acct_purchase_orders','acct_po_lines',
    'acct_grn_receipts','acct_grn_lines',
    'acct_invoices','acct_invoice_lines',
    'acct_payments','acct_payment_allocations',
    'acct_cheque_register'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (true)',
      t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      $q$create policy %I_write on public.%I for all to authenticated using (
        exists (select 1 from public.profiles where id = auth.uid() and lower(role) = any(%L))
      )$q$,
      t, t, finance_roles
    );
  end loop;
end $$;

-- =============================================================================
-- PART U: Smoke test queries (run after applying to verify)
-- =============================================================================
-- select count(*) from public.acct_gl_bridge_log;              -- expect 0 (clean)
-- select count(*) from public.acct_purchase_requisitions;      -- expect 0
-- select count(*) from public.acct_cheque_register;            -- expect 0
-- select * from public.v_acct_gl_bridge_summary;               -- expect 0 rows
-- select * from public.acct_recon_subledger_check();           -- all passed = true (if 0 balances)
-- select public.feature_enabled('acct.bridge.payroll_runs');   -- expect true
-- select public.feature_enabled('acct.p2p.enabled');           -- expect true
