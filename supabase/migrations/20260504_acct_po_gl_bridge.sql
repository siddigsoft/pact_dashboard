-- =============================================================================
-- PACT Accounting — PO GL Bridge
-- Fires an encumbrance journal when a Purchase Order is approved.
-- =============================================================================
-- Prerequisites: accounting_gl_bridges_phase3.sql must be applied first
--               (creates acct_bridge_post_journal and acct_gl_bridge_log).
-- Idempotent: safe to re-run.
-- =============================================================================

-- Fail fast on lock contention — no outer transaction so each statement
-- auto-commits and releases its lock immediately.
set lock_timeout = '5s';

-- Feature flag
insert into public.feature_flags (key, description, is_enabled)
values (
  'acct.bridge.acct_purchase_orders',
  'Auto-post GL encumbrance journal when a PO status transitions to approved',
  true
)
on conflict (key) do nothing;

-- =============================================================================
-- TRIGGER FUNCTION — acct_purchase_orders
-- Fires: AFTER UPDATE when status transitions to 'approved'
-- Journal:
--   DR  gl_account_id account (from PO, falls back to 5100 Operating Expense)
--   CR  2100  Accounts Payable (purchase commitment)
-- =============================================================================
create or replace function public.acct_trig_purchase_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_gl_code  text;
begin
  -- Only fire when status transitions TO 'approved'
  if tg_op = 'UPDATE'
     and new.status = 'approved'
     and coalesce(old.status, '') <> 'approved'
     and coalesce(new.amount, 0) > 0
  then
    -- Resolve GL account code from PO, fall back to 5100 Operating Expense
    select a.code into v_gl_code
      from public.acct_accounts a
     where a.id = new.gl_account_id
       and a.is_postable = true
     limit 1;
    v_gl_code := coalesce(v_gl_code, '5100');

    begin
      v_entry_id := public.acct_bridge_post_journal(
        'acct_purchase_orders',
        new.id,
        'po_approved',
        coalesce(new.approved_at::date, current_date),
        'PO Approved — ' || new.po_number || ': ' || new.title,
        'أمر شراء معتمد — ' || new.po_number || ': ' || new.title,
        jsonb_build_array(
          jsonb_build_object(
            'account_code', v_gl_code,
            'amount',       new.amount,
            'debit_credit', 'DR',
            'description',  'Purchase commitment: ' || new.po_number,
            'currency',     coalesce(new.currency, 'USD'),
            'function',     'program'
          ),
          jsonb_build_object(
            'account_code', '2100',
            'amount',       new.amount,
            'debit_credit', 'CR',
            'description',  'Accounts Payable — PO: ' || new.po_number,
            'currency',     coalesce(new.currency, 'USD'),
            'function',     'program'
          )
        ),
        new.approved_by
      );

      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, journal_entry_id)
      values
        ('acct_purchase_orders', new.id, 'po_approved', 'success', v_entry_id);

    exception when others then
      insert into public.acct_gl_bridge_log
        (source_table, source_id, event_type, status, error_message)
      values
        ('acct_purchase_orders', new.id, 'po_approved', 'error', sqlerrm);
    end;
  end if;
  return new;
end $$;

drop trigger if exists acct_bridge_purchase_orders on public.acct_purchase_orders;
create trigger acct_bridge_purchase_orders
  after update on public.acct_purchase_orders
  for each row execute function public.acct_trig_purchase_orders();

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- select key, is_enabled from public.feature_flags where key = 'acct.bridge.acct_purchase_orders';
-- Approve a PO then:
-- select * from public.acct_gl_bridge_log where source_table = 'acct_purchase_orders' order by created_at desc limit 5;
