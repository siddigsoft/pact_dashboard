-- ============================================================
-- Monitoring Dashboard Schema
-- Run this in the Supabase SQL editor ONCE before using the
-- System Monitoring Dashboard at /admin/monitoring
-- ============================================================

-- ── Helper: check if the calling user is a super admin ──────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$;

-- ── Online presence column on profiles ──────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- ── action_status_overrides ──────────────────────────────────
-- Append-only awareness layer; never mutates source tables.
-- The most-recent row per (action_type, action_id) pair is
-- the effective dashboard status.

CREATE TABLE IF NOT EXISTS public.action_status_overrides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    text        NOT NULL,
  action_type  text        NOT NULL
                           CHECK (action_type IN (
                             'mmp_lifecycle','mmp_site_entry','site_visit',
                             'cost_reimbursement','operational_cost','advance_payment',
                             'wallet_withdrawal','feedback','role_change'
                           )),
  source_table text,       -- informational: which source table this came from
  status       text        NOT NULL
                           CHECK (status IN ('received','acted','ignored','no_response')),
  set_by       uuid        NOT NULL REFERENCES public.profiles(id),
  set_at       timestamptz NOT NULL DEFAULT now(),
  notes        text
);

ALTER TABLE public.action_status_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_overrides_insert" ON public.action_status_overrides;
DROP POLICY IF EXISTS "superadmin_overrides_select" ON public.action_status_overrides;

CREATE POLICY "superadmin_overrides_insert"
  ON public.action_status_overrides
  FOR INSERT
  WITH CHECK (public.is_super_admin() AND set_by = auth.uid());

CREATE POLICY "superadmin_overrides_select"
  ON public.action_status_overrides
  FOR SELECT
  USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_action_status_overrides_action
  ON public.action_status_overrides(action_type, action_id);

CREATE INDEX IF NOT EXISTS idx_action_status_overrides_set_at
  ON public.action_status_overrides(set_at DESC);

-- ── dashboard_query_log ──────────────────────────────────────
-- Immutable query audit trail; never allow UPDATE or DELETE.

CREATE TABLE IF NOT EXISTS public.dashboard_query_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  queried_by    uuid        NOT NULL REFERENCES public.profiles(id),
  queried_at    timestamptz NOT NULL DEFAULT now(),
  filters       jsonb,
  row_count     integer,
  export_format text,       -- 'csv' (action feed) or 'pdf' (audit report), or null for reads
  ip_address    text,
  user_agent    text
);

ALTER TABLE public.dashboard_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_query_log_insert" ON public.dashboard_query_log;
DROP POLICY IF EXISTS "superadmin_query_log_select" ON public.dashboard_query_log;

CREATE POLICY "superadmin_query_log_insert"
  ON public.dashboard_query_log
  FOR INSERT
  WITH CHECK (public.is_super_admin() AND queried_by = auth.uid());

CREATE POLICY "superadmin_query_log_select"
  ON public.dashboard_query_log
  FOR SELECT
  USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_dashboard_query_log_queried_at
  ON public.dashboard_query_log(queried_at DESC);

-- ── dashboard_actions view ───────────────────────────────────
-- Unified view across all 9 source modules.
-- Includes ALL pending AND historical (terminal) states for each module,
-- allowing complete audit history, not just in-flight records.
-- sender_id is a UUID column used for notifications and online status.
-- "status" column in this view = native workflow status of the source row.

CREATE OR REPLACE VIEW public.dashboard_actions AS

-- MMP Lifecycle (all non-draft states)
-- sender_name: resolved from profiles.full_name for meaningful display
SELECT
  mf.id::text                                          AS action_id,
  'mmp_lifecycle'                                      AS action_type,
  'mmp_files'                                          AS source_table,
  COALESCE(mf.uploaded_by::text, '')                   AS sender_id,
  COALESCE(p_mf.full_name, mf.uploaded_by::text, 'Unknown') AS sender_name,
  'dataCollector'                                      AS sender_role,
  'admin'                                              AS recipient_role,
  mf.status                                            AS native_status,
  mf.created_at,
  COALESCE(mf.updated_at, mf.created_at)               AS updated_at,
  to_jsonb(mf.*)                                       AS details
FROM public.mmp_files mf
LEFT JOIN public.profiles p_mf ON p_mf.id = mf.uploaded_by
WHERE mf.status IS DISTINCT FROM 'draft'

UNION ALL

-- MMP Site Entries (all states)
-- sender_id: resolved from mmp_files.uploaded_by (owner of the MMP)
-- sender_name: from profiles.full_name for that owner
SELECT
  mse.id::text                                                      AS action_id,
  'mmp_site_entry'                                                  AS action_type,
  'mmp_site_entries'                                                AS source_table,
  COALESCE(mf2.uploaded_by::text, '')                               AS sender_id,
  COALESCE(p_mse.full_name, mse.site_name, 'Unknown')              AS sender_name,
  'dataCollector'                                                   AS sender_role,
  'coordinator'                                                     AS recipient_role,
  mse.status                                                        AS native_status,
  mse.created_at,
  COALESCE(mse.updated_at, mse.created_at)                          AS updated_at,
  to_jsonb(mse.*)                                                   AS details
FROM public.mmp_site_entries mse
LEFT JOIN public.mmp_files mf2 ON mf2.id = mse.mmp_id
LEFT JOIN public.profiles p_mse ON p_mse.id = mf2.uploaded_by

UNION ALL

-- Site Visits (all states — completed and cancelled are historical)
-- sender_name: from profiles.full_name for the assigned user
SELECT
  sv.id::text                                              AS action_id,
  'site_visit'                                             AS action_type,
  'site_visits'                                            AS source_table,
  COALESCE(sv.assigned_to::text, '')                       AS sender_id,
  COALESCE(p_sv.full_name, sv.assigned_to::text, 'Unassigned') AS sender_name,
  'dataCollector'                                          AS sender_role,
  'admin'                                                  AS recipient_role,
  sv.status                                                AS native_status,
  sv.created_at,
  COALESCE(sv.updated_at, sv.created_at)                   AS updated_at,
  to_jsonb(sv.*)                                           AS details
FROM public.site_visits sv
LEFT JOIN public.profiles p_sv ON p_sv.id = sv.assigned_to

UNION ALL

-- Cost Reimbursements (all states including paid/reconciled — historical)
-- sender_name: from profiles.full_name for the submitter
SELECT
  cs.id::text                                              AS action_id,
  'cost_reimbursement'                                     AS action_type,
  'cost_submissions'                                       AS source_table,
  COALESCE(cs.submitted_by::text, '')                      AS sender_id,
  COALESCE(p_cs.full_name, cs.submitted_by::text, 'Unknown') AS sender_name,
  'fieldOfficer'                                           AS sender_role,
  'finance_admin'                                          AS recipient_role,
  cs.status                                                AS native_status,
  cs.created_at,
  COALESCE(cs.updated_at, cs.created_at)                   AS updated_at,
  to_jsonb(cs.*)                                           AS details
FROM public.cost_submissions cs
LEFT JOIN public.profiles p_cs ON p_cs.id = cs.submitted_by

UNION ALL

-- Operational Costs (all states)
-- sender_name: from profiles.full_name for the submitter
SELECT
  ocs.id::text                                             AS action_id,
  'operational_cost'                                       AS action_type,
  'operational_cost_submissions'                           AS source_table,
  COALESCE(ocs.submitted_by::text, '')                     AS sender_id,
  COALESCE(p_ocs.full_name, ocs.submitted_by::text, 'Unknown') AS sender_name,
  COALESCE(ocs.submitter_role, 'fieldOfficer')             AS sender_role,
  'admin'                                                  AS recipient_role,
  ocs.status                                               AS native_status,
  ocs.created_at,
  COALESCE(ocs.updated_at, ocs.created_at)                 AS updated_at,
  to_jsonb(ocs.*)                                          AS details
FROM public.operational_cost_submissions ocs
LEFT JOIN public.profiles p_ocs ON p_ocs.id = ocs.submitted_by

UNION ALL

-- Advance Payments (all states including disbursed — historical)
-- sender_name: from profiles.full_name for the requester
SELECT
  dpr.id::text                                                AS action_id,
  'advance_payment'                                           AS action_type,
  'down_payment_requests'                                     AS source_table,
  COALESCE(dpr.requested_by::text, '')                        AS sender_id,
  COALESCE(p_dpr.full_name, dpr.requested_by::text, 'Unknown') AS sender_name,
  'fieldOfficer'                                              AS sender_role,
  'admin'                                                     AS recipient_role,
  dpr.status                                                  AS native_status,
  dpr.created_at,
  COALESCE(dpr.updated_at, dpr.created_at)                    AS updated_at,
  to_jsonb(dpr.*)                                             AS details
FROM public.down_payment_requests dpr
LEFT JOIN public.profiles p_dpr ON p_dpr.id = dpr.requested_by

UNION ALL

-- Wallet Withdrawals (all states including completed/rejected — historical)
-- sender_name: from profiles.full_name for the wallet owner
SELECT
  wt.id::text                                              AS action_id,
  'wallet_withdrawal'                                      AS action_type,
  'wallet_transactions'                                    AS source_table,
  COALESCE(wt.user_id::text, '')                           AS sender_id,
  COALESCE(p_wt.full_name, wt.user_id::text, 'Unknown')   AS sender_name,
  'fieldOfficer'                                           AS sender_role,
  'finance_admin'                                          AS recipient_role,
  wt.status                                                AS native_status,
  wt.created_at,
  COALESCE(wt.updated_at, wt.created_at)                   AS updated_at,
  to_jsonb(wt.*)                                           AS details
FROM public.wallet_transactions wt
LEFT JOIN public.profiles p_wt ON p_wt.id = wt.user_id
WHERE wt.transaction_type = 'withdrawal'

UNION ALL

-- Feedback (all states including dismissed/actioned — historical)
SELECT
  id::text                                                     AS action_id,
  'feedback'                                                   AS action_type,
  'feedback'                                                   AS source_table,
  COALESCE(user_id::text, '')                                  AS sender_id,
  COALESCE(user_name, user_email, user_id::text, 'Anonymous') AS sender_name,
  'user'                                                       AS sender_role,
  'admin'                                                      AS recipient_role,
  status                                                       AS native_status,
  created_at,
  COALESCE(updated_at, created_at)                             AS updated_at,
  to_jsonb(feedback.*)                                         AS details
FROM public.feedback

UNION ALL

-- Role/Resource Changes (all states — pending and resolved)
SELECT
  id::text                                                     AS action_id,
  'role_change'                                                AS action_type,
  'approval_requests'                                          AS source_table,
  COALESCE(requested_by::text, '')                             AS sender_id,
  COALESCE(requested_by_name, requested_by::text, 'Unknown')   AS sender_name,
  'admin'                                                      AS sender_role,
  'superAdmin'                                                 AS recipient_role,
  status                                                       AS native_status,
  created_at,
  COALESCE(updated_at, created_at)                             AS updated_at,
  to_jsonb(approval_requests.*)                                AS details
FROM public.approval_requests;

-- ── action_status_overrides: add source_table column ────────
ALTER TABLE public.action_status_overrides
  ADD COLUMN IF NOT EXISTS source_table text;

-- ── Hourly cron schedule for 48h no-response auto-flagging ──
-- Requires pg_cron extension. Enable it once with:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
-- Then run this block to upsert the schedule idempotently:
DO $$
BEGIN
  -- Remove old schedule if it exists (idempotent upsert)
  BEGIN
    PERFORM cron.unschedule('monitoring-flag-no-response');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job did not exist yet, ignore
  END;

  -- Register hourly schedule to invoke Edge Function via pg_net
  PERFORM cron.schedule(
    'monitoring-flag-no-response',
    '0 * * * *',
    format(
      $cmd$
        SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        );
      $cmd$,
      current_setting('app.supabase_functions_url', true) || '/monitoring-flag-no-response',
      json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      )::text,
      '{}'
    )
  );
END;
$$;

-- ── Alternative: Supabase Dashboard schedule (no pg_cron needed) ──
-- If pg_cron is not available, configure in Supabase Dashboard:
--   Edge Functions → Schedules → New Schedule
--   Function : monitoring-flag-no-response
--   Schedule : 0 * * * *  (every hour)
--   Method   : POST
--   Header   : Authorization: Bearer <SERVICE_ROLE_KEY>
