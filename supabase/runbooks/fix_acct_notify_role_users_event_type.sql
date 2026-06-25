-- ============================================================
-- FIX: "null value in column event_type" when marking cost
--      submission as paid (or any other acct bridge operation).
--
-- Root-cause chain:
--   UPDATE operational_cost_submissions SET status='paid'
--   → trigger acct_bridge_ops_cost
--   → acct_trig_operational_cost_submissions()
--   → acct_bridge_post_journal() fails (GL account not found)
--   → exception handler inserts into acct_gl_bridge_log (status='error')
--   → trigger acct_notify_gl_bridge_failure
--   → acct_notify_role_users()
--   → INSERT INTO notifications (...) ← missing event_type column
--   → NOT NULL constraint violation
--   → entire transaction rolls back → UPDATE fails with the error
--
-- Fix: add event_type to the INSERT inside acct_notify_role_users().
--      The value is already available as the p_event_type parameter.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste and run.
--   Safe to re-run (CREATE OR REPLACE is idempotent).
-- ============================================================

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
      user_id,
      event_type,   -- ← was missing; NOT NULL column requires this
      type,
      title,
      message,
      link,
      metadata,
      is_read,
      created_at
    ) VALUES (
      v_user_id,
      p_event_type, -- maps to event_type
      p_event_type, -- maps to type (legacy column)
      p_title,
      p_message,
      p_link,
      p_metadata,
      false,
      now()
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Verify the function was updated:
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'acct_notify_role_users';
