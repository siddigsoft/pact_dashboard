-- ============================================================
-- FIX: "null value in column event_type" when marking cost
--      submission as paid.
--
-- Root cause: a Postgres trigger on operational_cost_submissions
-- fires when status changes to 'paid' and INSERTs into the
-- notifications table WITHOUT providing event_type, which is
-- a NOT NULL column.
--
-- Resolution: the trigger is redundant — the app already sends
-- notifications from the frontend via NotificationTriggerService
-- and dispatchNotification(). Dropping it stops the DB error
-- without losing any notification.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste and run.
-- ============================================================

-- Step 1: Inspect — list every trigger on the table so you
--         can confirm which one is the culprit before dropping.
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  left(action_statement, 120) AS action_preview
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table  = 'operational_cost_submissions'
ORDER BY trigger_name;

-- Step 2: Drop any trigger on this table that references the
--         notifications table.  Run the SELECT above first,
--         find the trigger name, then un-comment the correct
--         DROP below and execute it.
--
-- Common names (drop the one that matches your output above):
DROP TRIGGER IF EXISTS trg_notify_cost_paid            ON public.operational_cost_submissions;
DROP TRIGGER IF EXISTS trg_cost_submission_notify      ON public.operational_cost_submissions;
DROP TRIGGER IF EXISTS notify_cost_submission_paid     ON public.operational_cost_submissions;
DROP TRIGGER IF EXISTS cost_submission_paid_notify     ON public.operational_cost_submissions;
DROP TRIGGER IF EXISTS on_cost_submission_paid         ON public.operational_cost_submissions;
DROP TRIGGER IF EXISTS cost_paid_notification_trigger  ON public.operational_cost_submissions;

-- Step 3 (optional): Drop the orphaned trigger function if it
--         exists and is no longer needed by any other trigger.
--         Check the action_statement from Step 1 to get the
--         function name (it will look like
--         EXECUTE FUNCTION public.fn_notify_cost_paid()).
--
-- DROP FUNCTION IF EXISTS public.fn_notify_cost_paid() CASCADE;
-- DROP FUNCTION IF EXISTS public.notify_cost_submission_paid() CASCADE;

-- Step 4: Verify — re-run the SELECT from Step 1.
--         The offending trigger should no longer appear.
SELECT
  trigger_name,
  event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table  = 'operational_cost_submissions'
ORDER BY trigger_name;
