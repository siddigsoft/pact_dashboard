-- =============================================================================
-- PACT Accounting — Phase 5 GL Bridges
-- Adds GL visibility / journal triggers for:
--   • acct_cash_flow_adjustments (INSERT → optional journal + bridge log)
--   • acct_grants (UPDATE status → bridge log)
--   • acct_grant_milestones (UPDATE status → 'accepted' → bridge log)
-- Plus: acct_grant_utilization() RPC, v_acct_phase5_coverage view
-- Apply AFTER:
--   1. accounting_gl_bridges_phase4.sql  (provides acct_gl_bridge_log + je_reference/je_description)
--   2. 20260502_acct_phase5_expansion.sql (provides acct_grants, acct_cash_flow_adjustments)
--   3. hr_advances_grant_milestones.sql   (provides acct_grant_milestones)
-- Idempotent: CREATE OR REPLACE + to_regclass guards
-- =============================================================================

-- =============================================================================
-- PART A: Infrastructure guard
-- =============================================================================

do $infra$ begin
  if to_regclass('public.acct_gl_bridge_log') is null then
    raise exception
      'acct_gl_bridge_log not found — apply 20260520_acct_phase2_gl_bridges.sql first';
  end if;
end $infra$;

-- =============================================================================
-- PART B: Cash Flow Adjustment GL bridge trigger
-- Fires AFTER INSERT on acct_cash_flow_adjustments.
-- Behaviour:
--   • If flag acct.bridge.cash_flow_adj is OFF → logs a 'skipped' entry only.
--   • If flag is ON → posts a balanced two-line journal (DR/CR) and logs 'success'.
--     Inflow  (amount > 0): DR 1110 Cash / CR 4990 Adjustment Clearing
--     Outflow (amount < 0): DR 4990 Adjustment Clearing / CR 1110 Cash
-- =============================================================================

create or replace function public.acct_trig_cash_flow_adj()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled    boolean;
  v_period_id  uuid;
  v_fund_id    uuid;
  v_je_id      uuid;
  v_entry_no   bigint;
  v_cash_acct  uuid;
  v_clr_acct   uuid;
  v_dr_acct    uuid;
  v_cr_acct    uuid;
  v_abs_amt    numeric;
  v_idem_key   text;
begin
  -- Feature flag check
  select is_enabled into v_enabled
  from public.feature_flags
  where key = 'acct.bridge.cash_flow_adj' limit 1;

  if v_enabled is not true then
    insert into public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, je_description)
    values
      ('acct_cash_flow_adjustments', new.id, 'created', 'skipped',
       'acct.bridge.cash_flow_adj disabled — enable to auto-post adjustment journals');
    return new;
  end if;

  -- Find open fiscal period
  select id into v_period_id
  from public.acct_fiscal_periods
  where start_date <= current_date
    and end_date   >= current_date
    and status = 'open'
  order by start_date desc limit 1;

  -- Find active fund (prefer GENERAL)
  select id into v_fund_id
  from public.acct_funds
  where code = 'GENERAL' and is_active = true limit 1;

  if v_fund_id is null then
    select id into v_fund_id
    from public.acct_funds where is_active = true limit 1;
  end if;

  if v_period_id is null or v_fund_id is null then
    insert into public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, je_description)
    values
      ('acct_cash_flow_adjustments', new.id, 'created', 'skipped',
       'No open period or active fund — configure fiscal periods and funds first');
    return new;
  end if;

  -- GL accounts: cash (DR side for inflows) and clearing (CR side for inflows)
  select id into v_cash_acct
  from public.acct_accounts
  where code in ('1110','1100','1000') and is_active = true
  order by code limit 1;

  select id into v_clr_acct
  from public.acct_accounts
  where code in ('4990','4999','9990') and is_active = true
  order by code limit 1;

  if v_cash_acct is null or v_clr_acct is null then
    insert into public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, je_description)
    values
      ('acct_cash_flow_adjustments', new.id, 'created', 'skipped',
       'GL accounts not found (need Cash 1110 and Clearing 4990) — seed COA first');
    return new;
  end if;

  -- Determine debit/credit sides based on inflow vs outflow
  v_abs_amt := abs(new.amount);
  if new.amount >= 0 then
    v_dr_acct := v_cash_acct;   -- inflow: DR Cash
    v_cr_acct := v_clr_acct;   -- inflow: CR Clearing
  else
    v_dr_acct := v_clr_acct;   -- outflow: DR Clearing
    v_cr_acct := v_cash_acct;  -- outflow: CR Cash
  end if;

  v_idem_key := 'cf_adj_' || new.id::text;

  begin
    insert into public.acct_journal_entries (
      period_id, posting_date, description_en,
      source_type, source_id,
      status, idempotency_key
    ) values (
      v_period_id,
      current_date,
      format('Cash flow adjustment: %s (%s)', coalesce(new.label,'Manual'), new.month_key),
      'cash_flow_adj',
      new.id,
      'posted',
      v_idem_key
    ) returning id, entry_no into v_je_id, v_entry_no;

    -- Debit line
    insert into public.acct_journal_lines (
      journal_entry_id, account_id, fund_id, description_en,
      debit_credit, functional_amount, original_amount, currency
    ) values (
      v_je_id, v_dr_acct, v_fund_id,
      format('CF adj DR — %s', coalesce(new.label,'')),
      'DR', v_abs_amt, v_abs_amt, 'USD'
    );

    -- Credit line
    insert into public.acct_journal_lines (
      journal_entry_id, account_id, fund_id, description_en,
      debit_credit, functional_amount, original_amount, currency
    ) values (
      v_je_id, v_cr_acct, v_fund_id,
      format('CF adj CR — %s', coalesce(new.label,'')),
      'CR', v_abs_amt, v_abs_amt, 'USD'
    );

    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status,
      journal_entry_id, je_reference, je_description
    ) values (
      'acct_cash_flow_adjustments', new.id, 'created', 'success',
      v_je_id,
      'JE-' || v_entry_no,
      format('Cash flow adjustment posted: %s %s %s',
        case when new.amount >= 0 then 'Inflow' else 'Outflow' end,
        v_abs_amt, coalesce(new.label,''))
    );

  exception when others then
    insert into public.acct_gl_bridge_log
      (source_table, source_id, event_type, status, error_message)
    values
      ('acct_cash_flow_adjustments', new.id, 'created', 'error', sqlerrm);
  end;

  return new;
end;
$$;

-- =============================================================================
-- PART C: Grant status change GL visibility trigger
-- Fires AFTER UPDATE on acct_grants when status changes.
-- Posts no journal — only logs a bridge entry for GL Bridge Audit visibility.
-- =============================================================================

create or replace function public.acct_trig_grant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select is_enabled into v_enabled
  from public.feature_flags
  where key = 'acct.bridge.grants' limit 1;

  if v_enabled is not true then
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, je_description
    ) values (
      'acct_grants',
      new.id,
      'status_' || new.status,
      'success',
      format('Grant "%s" status: %s → %s | Donor: %s | Amount: %s %s',
        new.grant_name, old.status, new.status,
        new.donor_name, new.award_amount, new.currency)
    );
  end if;

  return new;
end;
$$;

-- =============================================================================
-- PART D: Grant milestone accepted GL visibility trigger
-- Fires AFTER UPDATE on acct_grant_milestones when status → 'accepted'.
-- Status values: pending | in_progress | submitted | accepted | overdue
-- =============================================================================

create or replace function public.acct_trig_grant_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled    boolean;
  v_grant_name text;
begin
  select is_enabled into v_enabled
  from public.feature_flags
  where key = 'acct.bridge.milestones' limit 1;

  if v_enabled is not true then
    return new;
  end if;

  if old.status is distinct from new.status and new.status = 'accepted' then
    select grant_name into v_grant_name
    from public.acct_grants where id = new.grant_id;

    insert into public.acct_gl_bridge_log (
      source_table, source_id, event_type, status, je_description
    ) values (
      'acct_grant_milestones',
      new.id,
      'milestone_accepted',
      'success',
      format('Milestone "%s" accepted for grant "%s" (due: %s)',
        new.title, coalesce(v_grant_name,'Unknown'), new.due_date)
    );
  end if;

  return new;
end;
$$;

-- =============================================================================
-- PART E: acct_grant_utilization() RPC
-- Returns per-grant utilization: spent, remaining, burn rate, days to expiry.
-- Called by AccountingGrants.tsx and AccountingDonorReports.tsx.
-- =============================================================================

create or replace function public.acct_grant_utilization()
returns table (
  grant_id        uuid,
  grant_name      text,
  donor_name      text,
  currency        text,
  award_amount    numeric,
  total_spent     numeric,
  utilization_pct numeric,
  remaining       numeric,
  expense_count   bigint,
  end_date        date,
  days_to_expiry  int,
  status          text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id                                                        as grant_id,
    g.grant_name,
    g.donor_name,
    g.currency,
    g.award_amount,
    coalesce(sum(e.amount), 0)::numeric                         as total_spent,
    case
      when g.award_amount > 0
        then round(coalesce(sum(e.amount), 0) / g.award_amount * 100, 2)
      else 0
    end::numeric                                                as utilization_pct,
    (g.award_amount - coalesce(sum(e.amount), 0))::numeric      as remaining,
    count(e.id)::bigint                                         as expense_count,
    g.end_date,
    (g.end_date - current_date)::int                            as days_to_expiry,
    g.status
  from public.acct_grants g
  left join public.acct_grant_expenses e on e.grant_id = g.id
  group by
    g.id, g.grant_name, g.donor_name, g.currency,
    g.award_amount, g.end_date, g.status
  order by g.end_date;
$$;

-- =============================================================================
-- PART F: Phase 5 GL bridge coverage view
-- Aggregates bridge log entries for Phase 5 source tables.
-- Joins with v_acct_gl_bridge_coverage if it exists; otherwise standalone.
-- =============================================================================

create or replace view public.v_acct_phase5_coverage as
select
  source_table,
  count(*)                                                            as total_events,
  count(*) filter (where status = 'success')                          as success_count,
  count(*) filter (where status = 'error')                            as error_count,
  count(*) filter (where status = 'skipped')                          as skipped_count,
  round(
    count(*) filter (where status = 'success')::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                                   as success_pct,
  max(created_at)                                                     as last_event_at,
  max(created_at) filter (where status = 'error')                     as last_error_at,
  case
    when count(*) = 0                                    then 'no_data'
    when count(*) filter (where status = 'error') > 0   then 'degraded'
    else 'healthy'
  end                                                                 as health_status
from public.acct_gl_bridge_log
where source_table in (
  'acct_cash_flow_adjustments',
  'acct_grants',
  'acct_grant_milestones'
)
group by source_table;

-- =============================================================================
-- PART G: Trigger bindings — all guarded with to_regclass
-- =============================================================================

-- G1: acct_cash_flow_adjustments
do $guard_cfa$ begin
  if to_regclass('public.acct_cash_flow_adjustments') is not null then
    execute 'drop trigger if exists acct_bridge_cash_flow_adj
             on public.acct_cash_flow_adjustments';
    execute 'create trigger acct_bridge_cash_flow_adj
               after insert on public.acct_cash_flow_adjustments
               for each row execute function public.acct_trig_cash_flow_adj()';
    raise notice 'acct_bridge_cash_flow_adj created on acct_cash_flow_adjustments.';
  else
    raise notice 'SKIP: acct_cash_flow_adjustments not found — '
                 'apply 20260502_acct_phase5_expansion.sql first, then re-run.';
  end if;
end $guard_cfa$;

-- G2: acct_grants
do $guard_grants$ begin
  if to_regclass('public.acct_grants') is not null then
    execute 'drop trigger if exists acct_bridge_grant_status on public.acct_grants';
    execute 'create trigger acct_bridge_grant_status
               after update on public.acct_grants
               for each row execute function public.acct_trig_grant_status()';
    raise notice 'acct_bridge_grant_status created on acct_grants.';
  else
    raise notice 'SKIP: acct_grants not found — '
                 'apply 20260502_acct_phase5_expansion.sql first.';
  end if;
end $guard_grants$;

-- G3: acct_grant_milestones
do $guard_milestones$ begin
  if to_regclass('public.acct_grant_milestones') is not null then
    execute 'drop trigger if exists acct_bridge_grant_milestone
             on public.acct_grant_milestones';
    execute 'create trigger acct_bridge_grant_milestone
               after update on public.acct_grant_milestones
               for each row execute function public.acct_trig_grant_milestone()';
    raise notice 'acct_bridge_grant_milestone created on acct_grant_milestones.';
  else
    raise notice 'SKIP: acct_grant_milestones not found — '
                 'apply hr_advances_grant_milestones.sql first.';
  end if;
end $guard_milestones$;

-- =============================================================================
-- PART H: Feature flags
-- =============================================================================

insert into public.feature_flags (key, description, is_enabled) values
  ('acct.bridge.cash_flow_adj',
   'Phase 5: Post GL journal for cash flow adjustments (Inflow: DR Cash / CR Clearing; Outflow reversed). Disabled by default — enable after COA seeded.',
   false),
  ('acct.bridge.grants',
   'Phase 5: Log GL bridge entry when a grant status changes (active → closed → expired). Enabled by default for audit visibility.',
   true),
  ('acct.bridge.milestones',
   'Phase 5: Log GL bridge entry when a grant milestone is accepted. Enabled by default for grant tracking.',
   true)
on conflict (key) do nothing;

-- =============================================================================
-- Summary
-- =============================================================================
-- Triggers (all guarded):
--   acct_bridge_cash_flow_adj   on acct_cash_flow_adjustments (AFTER INSERT)
--   acct_bridge_grant_status    on acct_grants                (AFTER UPDATE)
--   acct_bridge_grant_milestone on acct_grant_milestones      (AFTER UPDATE)
-- Functions:
--   acct_trig_cash_flow_adj()     — cash flow adjustment bridge
--   acct_trig_grant_status()      — grant status change visibility
--   acct_trig_grant_milestone()   — milestone accepted visibility
--   acct_grant_utilization()      — grant utilization RPC (STABLE)
-- Views:
--   v_acct_phase5_coverage        — Phase 5 bridge health summary
-- Feature flags (ON = active, OFF = skipped):
--   acct.bridge.cash_flow_adj     (false — enable after COA seeded)
--   acct.bridge.grants            (true)
--   acct.bridge.milestones        (true)
-- =============================================================================
