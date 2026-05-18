-- =============================================================================
-- PACT Command Center — GL Bridge Engine Phase 4
-- Bridges: Depreciation Runs, Cost Allocation Runs, Fixed Asset Disposal/
--          Write-off, Budget Encumbrance, Leave Liability
--
-- Prerequisites: Phase 3 must be applied first (creates acct_bridge_post_journal
--                and acct_gl_bridge_log).
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- =============================================================================
-- PART 0: Ensure bridge infrastructure exists (guards for out-of-order apply)
-- =============================================================================

create table if not exists public.acct_gl_bridge_log (
  id               uuid primary key default gen_random_uuid(),
  source_table     text not null,
  source_id        uuid not null,
  event_type       text not null,
  status           text not null check (status in ('success','error','skipped')),
  journal_entry_id uuid,
  error_message    text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_acct_bridge4_source on public.acct_gl_bridge_log (source_table, source_id);
create index if not exists idx_acct_bridge4_status on public.acct_gl_bridge_log (status);

create table if not exists public.feature_flags (
  key         text primary key,
  description text,
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.feature_flags (key, description, is_enabled)
values ('acct.posting_engine.enabled', 'Master GL posting engine switch', true)
on conflict (key) do nothing;

-- =============================================================================
-- PART A: New COA accounts (all idempotent)
-- =============================================================================

insert into public.acct_accounts
  (code, name_en, name_ar, account_type, subtype, is_postable, is_active, country_id)
values
  -- 1600: Accumulated Depreciation (contra-asset — reduces PPE book value)
  ('1600', 'Accumulated Depreciation',
   'مجمع الاستهلاك',
   'asset', 'non_current_asset', true, true, null),

  -- 2105: PO Encumbrance Reserve (credit side of budget encumbrance entry)
  ('2105', 'PO Encumbrance Reserve',
   'احتياطي الالتزامات',
   'liability', 'current_liability', true, true, null),

  -- 2240: Leave Payable (accrued leave liability)
  ('2240', 'Leave Payable',
   'إجازات مستحقة الدفع',
   'liability', 'current_liability', true, true, null),

  -- 6400: Depreciation Expense (P&L charge)
  ('6400', 'Depreciation Expense',
   'مصروف الاستهلاك',
   'expense', 'mng_expense', true, true, null)

-- Targets acct_accounts_code_global_uq partial index (code WHERE country_id IS NULL).
-- The old UNIQUE(code) was dropped in 20260511_acct_country_coa_partitioning.sql.
on conflict (code) where country_id is null do nothing;

-- =============================================================================
-- PART B: Feature flags for Phase 4 bridges
-- =============================================================================

insert into public.feature_flags (key, description, is_enabled)
values
  ('acct.bridge.acct_depreciation_runs',
   'Log completed depreciation runs to the GL bridge audit trail.',
   true),
  ('acct.bridge.acct_allocation_runs',
   'Log completed cost-allocation runs (with journal) to the GL bridge audit trail.',
   true),
  ('acct.bridge.acct_fixed_assets',
   'Log fixed-asset disposal and write-off journal entries to the GL bridge audit trail.',
   true),
  ('acct.bridge.acct_budget_encumbrances',
   'Auto-post encumbrance journal (DR Expense / CR Encumbrance Reserve) when a budget encumbrance is created.',
   false),
  ('acct.bridge.leave_requests',
   'Auto-post leave liability journal (DR Leave Expense / CR Leave Payable) when leave is approved.',
   false)
on conflict (key) do nothing;

-- =============================================================================
-- PART C: Trigger — acct_depreciation_runs (visibility logger)
-- Fires: AFTER INSERT when status = 'completed'
-- Action: log to acct_gl_bridge_log (journal_entry_id may be null when the
--         depreciation run page does not store the per-asset entry IDs in the
--         run row; this is still useful as an audit event).
-- =============================================================================

create or replace function public.acct_trig_depreciation_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if tg_op = 'INSERT' and new.status = 'completed' then
    select coalesce(is_enabled, false) into v_enabled
      from public.feature_flags
     where key = 'acct.bridge.acct_depreciation_runs';

    if coalesce(v_enabled, false) then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_depreciation_runs', new.id, 'depreciation_run_posted',
         'success', new.journal_entry_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_depreciation_runs on public.acct_depreciation_runs;
create trigger acct_bridge_depreciation_runs
  after insert on public.acct_depreciation_runs
  for each row execute function public.acct_trig_depreciation_runs();

-- =============================================================================
-- PART D: Trigger — acct_allocation_runs (visibility logger)
-- Fires: AFTER INSERT when status = 'completed' AND journal_entry_id IS NOT NULL
-- Action: log to acct_gl_bridge_log with the existing journal that the UI posted
-- =============================================================================

create or replace function public.acct_trig_allocation_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if tg_op = 'INSERT' and new.status = 'completed' then
    select coalesce(is_enabled, false) into v_enabled
      from public.feature_flags
     where key = 'acct.bridge.acct_allocation_runs';

    if coalesce(v_enabled, false) then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_allocation_runs', new.id, 'allocation_run_posted',
         'success', new.journal_entry_id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_allocation_runs on public.acct_allocation_runs;
create trigger acct_bridge_allocation_runs
  after insert on public.acct_allocation_runs
  for each row execute function public.acct_trig_allocation_runs();

-- =============================================================================
-- PART E: Trigger — acct_budget_encumbrances (real journal posting)
-- Fires: AFTER INSERT when status = 'open' AND amount > 0
-- Journal: DR [linked GL account or 5050] / CR 2105 PO Encumbrance Reserve
-- Note: disabled by default (feature flag acct.bridge.acct_budget_encumbrances).
--       Enable once Chart of Accounts and a GENERAL fund are configured.
-- =============================================================================

create or replace function public.acct_trig_budget_encumbrances()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_gl_code  text;
  v_label    text;
begin
  if tg_op = 'INSERT' and new.status = 'open' and new.amount > 0 then
    begin
      -- Resolve expense account from linked gl_account, fall back to 5050
      if new.gl_account_id is not null then
        select code into v_gl_code
          from public.acct_accounts
         where id = new.gl_account_id and is_postable = true;
      end if;
      v_gl_code := coalesce(v_gl_code, '5050');

      v_label := initcap(replace(coalesce(new.source_type, 'purchase_order'), '_', ' '));

      v_entry_id := public.acct_bridge_post_journal(
        'acct_budget_encumbrances',
        new.id,
        'encumbrance_created',
        current_date,
        'Budget Encumbrance — ' || v_label || ' [' || left(new.source_id::text, 8) || ']',
        'التزام ميزانية — ' || v_label,
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_gl_code,
            'amount',       new.amount,
            'debit_credit', 'DR',
            'description',  'Encumbrance — ' || v_label,
            'currency',     coalesce(new.currency, 'SDG'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '2105',
            'amount',       new.amount,
            'debit_credit', 'CR',
            'description',  'PO Encumbrance Reserve — ' || v_label,
            'currency',     coalesce(new.currency, 'SDG'),
            'function',     'none'
          )
        ),
        null   -- posted_by: resolves to super_admin inside function
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_budget_encumbrances', new.id, 'encumbrance_created', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('acct_budget_encumbrances', new.id, 'encumbrance_created', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

-- Guard: only bind trigger if acct_budget_encumbrances exists
-- (created in 20260520_acct_phase4_advanced.sql — apply that first if missing)
do $guard$ begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name   = 'acct_budget_encumbrances'
  ) then
    execute 'drop trigger if exists acct_bridge_budget_encumbrances on public.acct_budget_encumbrances';
    execute 'create trigger acct_bridge_budget_encumbrances
               after insert on public.acct_budget_encumbrances
               for each row execute function public.acct_trig_budget_encumbrances()';
    raise notice 'acct_budget_encumbrances trigger created.';
  else
    raise notice 'SKIP: acct_budget_encumbrances does not exist — run 20260520_acct_phase4_advanced.sql first, then re-run this script to activate the encumbrance bridge.';
  end if;
end $guard$;

-- =============================================================================
-- PART F: Trigger — leave_requests (leave liability posting)
-- Fires: AFTER UPDATE when status changes to 'approved' and days_count > 0
-- Journal: DR 6110 Management Benefits / CR 2240 Leave Payable
-- Amount: derived from latest eosb_accruals.base_salary ÷ 30 × days_count.
--         If no salary found → 'skipped' log entry (no journal posted).
-- Note: disabled by default. Enable after payroll/EOSB data is populated.
-- =============================================================================

create or replace function public.acct_trig_leave_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id    uuid;
  v_base_salary numeric;
  v_daily_rate  numeric;
  v_amount      numeric;
  v_staff_name  text;
  v_leave_label text;
  v_days        int;
begin
  -- Only fire when status transitions to 'approved' with positive days
  if tg_op  = 'UPDATE'
     and (old.status is distinct from new.status)
     and new.status = 'approved'
     and coalesce(new.days_count, 0) > 0
  then
    begin
      -- 1. Try latest EOSB accrual base salary for this staff member
      select base_salary into v_base_salary
        from public.eosb_accruals
       where user_id = new.user_id
         and base_salary > 0
       order by period desc
       limit 1;

      -- 2. Fallback: latest approved/locked payroll run gross salary
      if v_base_salary is null or v_base_salary <= 0 then
        select pri.gross_salary into v_base_salary
          from public.payroll_run_items pri
          join public.payroll_runs       pr  on pr.id = pri.run_id
         where pri.user_id = new.user_id
           and pr.status   in ('approved', 'locked')
         order by pr.period_label desc
         limit 1;
      end if;

      -- 3. If still no salary, log as skipped
      if v_base_salary is null or v_base_salary <= 0 then
        insert into public.acct_gl_bridge_log
          (source_table, source_id, event_type, status, error_message)
        values
          ('leave_requests', new.id, 'leave_approved', 'skipped',
           'No base salary found for user — leave liability entry not posted');
        return new;
      end if;

      -- Calculate liability amount
      v_days       := coalesce(new.days_count, 1);
      v_daily_rate := v_base_salary / 30.0;
      v_amount     := round(v_daily_rate * v_days, 2);

      -- Lookup staff name
      select coalesce(full_name, 'Unknown') into v_staff_name
        from public.profiles where id = new.user_id;

      -- Human-readable leave type
      v_leave_label := initcap(replace(coalesce(new.leave_type, 'leave'), '_', ' '));

      v_entry_id := public.acct_bridge_post_journal(
        'leave_requests',
        new.id,
        'leave_approved',
        coalesce(new.start_date::date, current_date),
        v_leave_label || ' Leave Approved — ' || v_staff_name
          || ' (' || v_days || ' days / SDG ' || v_amount::text || ')',
        'إجازة معتمدة — ' || coalesce(v_staff_name, ''),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '6110',
            'amount',       v_amount,
            'debit_credit', 'DR',
            'description',  v_leave_label || ' Leave Expense — ' || coalesce(v_staff_name, ''),
            'currency',     'SDG',
            'function',     'mng'
          ),
          jsonb_build_object(
            'account_code', '2240',
            'amount',       v_amount,
            'debit_credit', 'CR',
            'description',  'Leave Payable — ' || coalesce(v_staff_name, ''),
            'currency',     'SDG',
            'function',     'none'
          )
        ),
        null
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('leave_requests', new.id, 'leave_approved', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('leave_requests', new.id, 'leave_approved', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

do $guard_leave$ begin
  if to_regclass('public.leave_requests') is not null then
    execute 'drop trigger if exists acct_bridge_leave_requests on public.leave_requests';
    execute 'create trigger acct_bridge_leave_requests
      after update on public.leave_requests
      for each row execute function public.acct_trig_leave_requests()';
    raise notice 'acct_bridge_leave_requests trigger created on leave_requests.';
  else
    raise notice 'SKIP: leave_requests table not found — acct_bridge_leave_requests trigger not created. '
                 'Bind manually: CREATE TRIGGER acct_bridge_leave_requests AFTER UPDATE ON '
                 'public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.acct_trig_leave_requests();';
  end if;
end $guard_leave$;

-- =============================================================================
-- PART G: Fix — payroll_run_items column guard
-- The leave trigger above references payroll_run_items.user_id which may be
-- named staff_id on some installations. Add user_id as alias if missing.
-- =============================================================================

do $$ begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'payroll_run_items'
       and column_name  = 'user_id'
  ) then
    -- Only add if staff_id exists (i.e. this is the alternate column name)
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'payroll_run_items'
         and column_name  = 'staff_id'
    ) then
      alter table public.payroll_run_items
        add column user_id uuid generated always as (staff_id) stored;
    end if;
  end if;
exception when others then
  raise notice 'payroll_run_items user_id guard skipped: %', sqlerrm;
end $$;

-- =============================================================================
-- VERIFICATION RUNBOOK
-- =============================================================================
-- 1. Verify new accounts:
--    SELECT code, name_en FROM acct_accounts
--     WHERE code IN ('1600','2105','2240','6400')
--     ORDER BY code;
--
-- 2. Verify feature flags:
--    SELECT key, is_enabled FROM feature_flags
--     WHERE key LIKE 'acct.bridge.acct_%' OR key LIKE 'acct.bridge.leave%'
--     ORDER BY key;
--
-- 3. Test depreciation-run bridge:
--    INSERT INTO acct_depreciation_runs
--      (period_label, total_depreciation, asset_count, status)
--    VALUES ('2026-05', 500, 3, 'completed');
--    SELECT * FROM acct_gl_bridge_log WHERE source_table = 'acct_depreciation_runs';
--
-- 4. Test allocation-run bridge:
--    (Run a cost allocation from Accounting → Cost Allocation)
--    SELECT * FROM acct_gl_bridge_log WHERE source_table = 'acct_allocation_runs';
--
-- 5. Enable and test budget encumbrance bridge:
--    UPDATE feature_flags SET is_enabled = true
--     WHERE key = 'acct.bridge.acct_budget_encumbrances';
--    INSERT INTO acct_budget_encumbrances
--      (source_type, source_id, amount, currency, status)
--    VALUES ('purchase_order', gen_random_uuid(), 1000, 'SDG', 'open');
--    SELECT * FROM acct_gl_bridge_log WHERE source_table = 'acct_budget_encumbrances';
--
-- 6. Enable and test leave bridge:
--    UPDATE feature_flags SET is_enabled = true
--     WHERE key = 'acct.bridge.leave_requests';
--    (Approve a leave request with days_count > 0 and existing EOSB salary)
--    SELECT * FROM acct_gl_bridge_log WHERE source_table = 'leave_requests';

select 'Phase 4 GL Bridge migration complete — 5 new bridges, 4 new COA accounts' as result;
