-- =============================================================================
-- PACT Accounting — Notification Rules & Alert Triggers
-- =============================================================================
-- Migration  : 20260502_acct_accounting_notifications.sql
-- Purpose    : Accounting-specific in-app notifications for:
--              1. AP invoices going overdue
--              2. GL bridge posting failures
--              3. Grant expiry warnings (≤30 days remaining)
--              4. Period close reminders (open period past end_date)
-- Apply      : MANUAL — paste into Supabase SQL editor
-- Idempotent : YES — conditional trigger creation, IF EXISTS guards
-- NOTE       : Triggers only attach to tables that already exist in your DB.
--              Re-run after applying the relevant phase migrations.
-- =============================================================================

begin;

-- =============================================================================
-- PART A: Helper — send a notification to all users with accounting roles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_notify_role_users(
  p_event_type    text,
  p_title         text,
  p_message       text,
  p_link          text  DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE p.role IN (
      'super_admin', 'admin', 'finance', 'financialAdmin',
      'financialadmin', 'financial_admin', 'accountant', 'auditor', 'fom', 'FOM'
    )
    AND p.is_active IS NOT FALSE
  LOOP
    INSERT INTO public.notifications (
      user_id, type, title, message, link, metadata, is_read, created_at
    ) VALUES (
      v_user_id, p_event_type, p_title, p_message,
      p_link, p_metadata, false, now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- =============================================================================
-- PART B: AP Invoice overdue trigger
-- Only created if acct_invoices table exists
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_trg_invoice_overdue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('paid','partial_paid','cancelled','written_off')
     AND NEW.due_date IS NOT NULL
     AND NEW.due_date < CURRENT_DATE
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.due_date IS DISTINCT FROM NEW.due_date)
  THEN
    PERFORM public.acct_notify_role_users(
      'accounting_ap_overdue',
      'AP Invoice Overdue',
      format('Invoice %s is overdue by %s day(s). Amount: %s %s',
        NEW.invoice_number,
        CURRENT_DATE - NEW.due_date,
        NEW.total_amount,
        NEW.currency
      ),
      '/accounting/ap-invoices',
      jsonb_build_object(
        'invoice_id',     NEW.id,
        'invoice_number', NEW.invoice_number,
        'due_date',       NEW.due_date,
        'total_amount',   NEW.total_amount,
        'currency',       NEW.currency,
        'days_overdue',   CURRENT_DATE - NEW.due_date
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'acct_invoices') THEN
    DROP TRIGGER IF EXISTS acct_notify_invoice_overdue ON public.acct_invoices;
    CREATE TRIGGER acct_notify_invoice_overdue
      AFTER INSERT OR UPDATE ON public.acct_invoices
      FOR EACH ROW EXECUTE FUNCTION public.acct_trg_invoice_overdue();
    RAISE NOTICE 'Trigger acct_notify_invoice_overdue created on acct_invoices';
  ELSE
    RAISE NOTICE 'SKIP: acct_invoices does not exist — run AP Invoices migration first, then re-apply this file';
  END IF;
END;
$$;

-- =============================================================================
-- PART C: GL Bridge failure trigger
-- Only created if acct_gl_bridge_log table exists
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_trg_gl_bridge_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.result = 'error' THEN
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'acct_gl_bridge_log') THEN
    DROP TRIGGER IF EXISTS acct_notify_gl_bridge_failure ON public.acct_gl_bridge_log;
    CREATE TRIGGER acct_notify_gl_bridge_failure
      AFTER INSERT ON public.acct_gl_bridge_log
      FOR EACH ROW EXECUTE FUNCTION public.acct_trg_gl_bridge_failure();
    RAISE NOTICE 'Trigger acct_notify_gl_bridge_failure created on acct_gl_bridge_log';
  ELSE
    RAISE NOTICE 'SKIP: acct_gl_bridge_log does not exist — run GL Bridge migration first';
  END IF;
END;
$$;

-- =============================================================================
-- PART D: Grant expiry warning trigger
-- Only created if acct_grants table exists
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_trg_grant_expiry_warning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_left int;
BEGIN
  IF NEW.end_date IS NOT NULL AND NEW.status NOT IN ('expired','draft') THEN
    v_days_left := NEW.end_date - CURRENT_DATE;
    IF v_days_left BETWEEN 0 AND 30
       AND (OLD.end_date IS DISTINCT FROM NEW.end_date OR OLD.status IS DISTINCT FROM NEW.status)
    THEN
      PERFORM public.acct_notify_role_users(
        'accounting_grant_expiry',
        'Grant Expiring Soon',
        format('Grant "%s" expires in %s day(s) on %s. Awarded: %s %s',
          NEW.name_en, v_days_left, NEW.end_date, NEW.award_amount, NEW.currency
        ),
        '/accounting/grants',
        jsonb_build_object(
          'grant_id',     NEW.id,
          'grant_name',   NEW.name_en,
          'end_date',     NEW.end_date,
          'days_left',    v_days_left,
          'award_amount', NEW.award_amount
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'acct_grants') THEN
    DROP TRIGGER IF EXISTS acct_notify_grant_expiry ON public.acct_grants;
    CREATE TRIGGER acct_notify_grant_expiry
      AFTER INSERT OR UPDATE ON public.acct_grants
      FOR EACH ROW EXECUTE FUNCTION public.acct_trg_grant_expiry_warning();
    RAISE NOTICE 'Trigger acct_notify_grant_expiry created on acct_grants';
  ELSE
    RAISE NOTICE 'SKIP: acct_grants does not exist — run Phase 5 migration first';
  END IF;
END;
$$;

-- =============================================================================
-- PART E: Period close reminder trigger
-- Only created if acct_fiscal_periods table exists
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acct_trg_period_close_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.end_date < CURRENT_DATE
     AND OLD.end_date IS DISTINCT FROM NEW.end_date
  THEN
    PERFORM public.acct_notify_role_users(
      'accounting_period_close_overdue',
      'Fiscal Period Needs Closing',
      format('Period "%s" ended on %s and is still open. Please initiate the period close workflow.',
        NEW.period_name, NEW.end_date
      ),
      '/accounting/period-close',
      jsonb_build_object(
        'period_id',   NEW.id,
        'period_name', NEW.period_name,
        'end_date',    NEW.end_date,
        'days_past',   CURRENT_DATE - NEW.end_date
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'acct_fiscal_periods') THEN
    DROP TRIGGER IF EXISTS acct_notify_period_close ON public.acct_fiscal_periods;
    CREATE TRIGGER acct_notify_period_close
      AFTER INSERT OR UPDATE ON public.acct_fiscal_periods
      FOR EACH ROW EXECUTE FUNCTION public.acct_trg_period_close_reminder();
    RAISE NOTICE 'Trigger acct_notify_period_close created on acct_fiscal_periods';
  ELSE
    RAISE NOTICE 'SKIP: acct_fiscal_periods does not exist — run Fiscal Years migration first';
  END IF;
END;
$$;

-- =============================================================================
-- PART F: Notification type index for fast lookup
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_notifications_type_acct
  ON public.notifications (type)
  WHERE type LIKE 'accounting_%';

RAISE NOTICE 'acct_notify_role_users() helper function created successfully.';
RAISE NOTICE 'All triggers applied conditionally — check NOTICE messages above for skipped tables.';

commit;

-- =============================================================================
-- POST-APPLY: Verify which triggers were installed
-- =============================================================================
--   SELECT event_object_table, trigger_name
--   FROM information_schema.triggers
--   WHERE trigger_name LIKE 'acct_notify%'
--   ORDER BY event_object_table;
--
-- Re-run after applying Phase 2/3/4/5 migrations to pick up skipped triggers.
--
-- Manual scan for existing overdue AP invoices (run once after applying):
--
--   SELECT public.acct_notify_role_users(
--     'accounting_ap_overdue', 'AP Invoice Overdue',
--     format('Invoice %s is %s day(s) overdue. Amount: %s %s',
--       inv.invoice_number, CURRENT_DATE - inv.due_date, inv.total_amount, inv.currency),
--     '/accounting/ap-invoices',
--     jsonb_build_object('invoice_id', inv.id, 'days_overdue', CURRENT_DATE - inv.due_date)
--   )
--   FROM public.acct_invoices inv
--   WHERE inv.status NOT IN ('paid','partial_paid','cancelled','written_off')
--     AND inv.due_date IS NOT NULL AND inv.due_date < CURRENT_DATE;
