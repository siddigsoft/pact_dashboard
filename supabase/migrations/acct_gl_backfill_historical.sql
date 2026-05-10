-- =============================================================================
-- PACT Accounting — GL Bridge Backfill for Historical Records
-- Posts GL journal entries for all paid cost submissions and fully-paid
-- down-payment requests that existed BEFORE the triggers were installed.
-- =============================================================================
-- File    : acct_gl_backfill_historical.sql
-- Apply   : MANUAL — paste into Supabase SQL editor
-- Safe    : YES — fully idempotent.
--           • acct_bridge_post_journal deduplicates on idempotency_key
--           • The WHERE NOT EXISTS guard skips records already in the log.
-- =============================================================================

set lock_timeout = '5s';

-- =============================================================================
-- STEP 0 — Fix the broken notification trigger (NEW.result → NEW.status)
-- This must run before Steps 1 & 2 or every INSERT into acct_gl_bridge_log
-- will fail with "record new has no field result".
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_trg_gl_bridge_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'error' THEN
    PERFORM public.acct_notify_role_users(
      'accounting_gl_bridge_failure',
      'GL Bridge Posting Failed',
      format('GL bridge posting failed for %s (record %s): %s',
        COALESCE(NEW.source_table, 'unknown table'),
        COALESCE(NEW.source_id::text, '?'),
        COALESCE(NEW.error_message, 'No details available')
      ),
      '/accounting/gl-bridge',
      jsonb_build_object(
        'log_id',       NEW.id,
        'source_table', NEW.source_table,
        'source_id',    NEW.source_id,
        'error',        NEW.error_message
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- STEP 1 — Dry-run counts (review before continuing)
-- =============================================================================

select
  count(*) as total_paid_costs,
  count(*) filter (
    where not exists (
      select 1 from public.acct_gl_bridge_log l
       where l.source_table = 'operational_cost_submissions'
         and l.source_id    = ocs.id
         and l.status       = 'success'
    )
  ) as needs_backfill
from public.operational_cost_submissions ocs
where lower(ocs.status) = 'paid'
  and coalesce(ocs.amount_cents, 0) > 0;

select
  count(*) as total_fully_paid_dp,
  count(*) filter (
    where not exists (
      select 1 from public.acct_gl_bridge_log l
       where l.source_table = 'down_payment_requests'
         and l.source_id    = dp.id
         and l.status       = 'success'
    )
  ) as needs_backfill
from public.down_payment_requests dp
where lower(dp.status) = 'fully_paid'
  and coalesce(dp.total_paid_amount, dp.requested_amount, 0) > 0;

-- =============================================================================
-- STEP 2 — Backfill: operational_cost_submissions (status = 'paid')
-- =============================================================================

do $$
declare
  rec           record;
  v_entry_id    uuid;
  v_amount      numeric(20,4);
  v_expense_acc text;
  v_ok          int := 0;
  v_err         int := 0;
begin
  for rec in
    select *
      from public.operational_cost_submissions
     where lower(status) = 'paid'
       and coalesce(amount_cents, 0) > 0
       and not exists (
             select 1
               from public.acct_gl_bridge_log l
              where l.source_table = 'operational_cost_submissions'
                and l.source_id   = operational_cost_submissions.id
                and l.status      = 'success'
           )
     order by created_at
  loop
    begin
      v_amount      := rec.amount_cents / 100.0;
      v_expense_acc := public.acct_bridge_ops_cost_account(rec.expense_category);

      v_entry_id := public.acct_bridge_post_journal(
        'operational_cost_submissions',
        rec.id,
        'paid',
        coalesce(rec.expense_date, rec.created_at::date, current_date),
        'Operational Cost Paid: ' || coalesce(rec.expense_category, 'general'),
        'تكلفة تشغيلية مدفوعة: '  || coalesce(rec.expense_category, 'عامة'),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_expense_acc,
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     coalesce(rec.currency, 'SDG'),
            'description',  coalesce(rec.description, rec.expense_category),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     coalesce(rec.currency, 'SDG'),
            'description',  'Cash Payment — Ops Cost #' || rec.id::text,
            'function',     'none'
          )
        ),
        rec.tier2_approved_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('operational_cost_submissions', rec.id, 'ops_cost_paid', 'success', v_entry_id);

      v_ok := v_ok + 1;

    exception
      when others then
        declare v_msg text := sqlerrm;
        begin
          if v_msg like 'BRIDGE_SKIP%' then
            raise notice 'Bridge flag is OFF — enable acct.posting_engine.enabled and acct.bridge.operational_cost_submissions first, then re-run.';
            return;
          end if;
          insert into public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, error_message)
          values
            ('operational_cost_submissions', rec.id, 'ops_cost_paid', 'error', v_msg);
          v_err := v_err + 1;
          raise notice 'ERROR ops cost id=%: %', rec.id, v_msg;
        end;
    end;
  end loop;

  raise notice '=== Ops Cost Backfill: % posted, % errors ===', v_ok, v_err;
end $$;

-- =============================================================================
-- STEP 3 — Backfill: down_payment_requests (status = 'fully_paid')
-- =============================================================================

do $$
declare
  rec        record;
  v_entry_id uuid;
  v_amount   numeric(20,4);
  v_ok       int := 0;
  v_err      int := 0;
begin
  for rec in
    select *
      from public.down_payment_requests
     where lower(status) = 'fully_paid'
       and coalesce(total_paid_amount, requested_amount, 0) > 0
       and not exists (
             select 1
               from public.acct_gl_bridge_log l
              where l.source_table = 'down_payment_requests'
                and l.source_id   = down_payment_requests.id
                and l.status      = 'success'
           )
     order by created_at
  loop
    begin
      v_amount := coalesce(rec.total_paid_amount, rec.requested_amount, 0);

      v_entry_id := public.acct_bridge_post_journal(
        'down_payment_requests',
        rec.id,
        'fully_paid',
        coalesce(rec.updated_at::date, rec.created_at::date, current_date),
        'Field Advance Disbursed: ' || coalesce(rec.site_name, rec.id::text),
        'صرف سلفة ميدانية: '         || coalesce(rec.site_name, rec.id::text),
        jsonb_build_array(
          jsonb_build_object(
            'account_code', '1510',
            'debit_credit', 'DR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Travel Advance — ' || coalesce(rec.site_name, 'Field Site'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '1200',
            'debit_credit', 'CR',
            'amount',       v_amount,
            'currency',     'SDG',
            'description',  'Cash — Field Advance #' || rec.id::text,
            'function',     'none'
          )
        ),
        rec.admin_processed_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('down_payment_requests', rec.id, 'down_payment_fully_paid', 'success', v_entry_id);

      v_ok := v_ok + 1;

    exception
      when others then
        declare v_msg text := sqlerrm;
        begin
          if v_msg like 'BRIDGE_SKIP%' then
            raise notice 'Bridge flag is OFF — enable acct.posting_engine.enabled and acct.bridge.down_payment_requests first, then re-run.';
            return;
          end if;
          insert into public.acct_gl_bridge_log
            (source_table, source_id, event_type, status, error_message)
          values
            ('down_payment_requests', rec.id, 'down_payment_fully_paid', 'error', v_msg);
          v_err := v_err + 1;
          raise notice 'ERROR down payment id=%: %', rec.id, v_msg;
        end;
    end;
  end loop;

  raise notice '=== Down Payment Backfill: % posted, % errors ===', v_ok, v_err;
end $$;

-- =============================================================================
-- STEP 4 — Verify: these queries should return 0 rows when complete
-- =============================================================================

select 'operational_cost_submissions' as source_table, id, status,
       amount_cents / 100.0 as amount
  from public.operational_cost_submissions
 where lower(status) = 'paid'
   and coalesce(amount_cents, 0) > 0
   and not exists (
         select 1 from public.acct_gl_bridge_log l
          where l.source_table = 'operational_cost_submissions'
            and l.source_id = operational_cost_submissions.id
            and l.status = 'success'
       )
union all
select 'down_payment_requests', id, status,
       coalesce(total_paid_amount, requested_amount, 0)
  from public.down_payment_requests
 where lower(status) = 'fully_paid'
   and coalesce(total_paid_amount, requested_amount, 0) > 0
   and not exists (
         select 1 from public.acct_gl_bridge_log l
          where l.source_table = 'down_payment_requests'
            and l.source_id = down_payment_requests.id
            and l.status = 'success'
       );

-- Bridge log summary
select source_table, event_type, status, count(*)
  from public.acct_gl_bridge_log
 where source_table in ('operational_cost_submissions','down_payment_requests')
 group by source_table, event_type, status
 order by source_table, status;
