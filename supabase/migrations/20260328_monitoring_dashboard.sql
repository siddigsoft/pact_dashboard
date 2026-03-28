-- Monitoring Dashboard: tables, view, RLS, indexes
-- Provisioned as a versioned migration (2026-03-28)

-- Helper: super-admin check used in RLS policies
-- Drop all overloaded variants before recreating to avoid ambiguity error
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'is_super_admin'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END;
$$;

CREATE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Online presence column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- Awareness overlay table (append-only; never mutates source tables)
CREATE TABLE IF NOT EXISTS public.action_status_overrides (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    text        NOT NULL,
  action_type  text        NOT NULL
                           CHECK (action_type IN (
                             'mmp_lifecycle','mmp_site_entry','site_visit',
                             'cost_reimbursement','operational_cost','advance_payment',
                             'wallet_withdrawal','feedback','role_change'
                           )),
  source_table text,
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

-- Query audit log (immutable; no UPDATE or DELETE)
CREATE TABLE IF NOT EXISTS public.dashboard_query_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  queried_by    uuid        NOT NULL REFERENCES public.profiles(id),
  queried_at    timestamptz NOT NULL DEFAULT now(),
  filters       jsonb,
  row_count     integer,
  export_format text,
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

-- Role change / resource approval requests table (9th module)
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text        NOT NULL,
  resource_type    text,
  resource_id      text,
  resource_name    text,
  resource_details jsonb,
  requested_by     uuid        REFERENCES public.profiles(id),
  requested_by_name text,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by      uuid        REFERENCES public.profiles(id),
  reviewed_by_name text,
  reviewed_at      timestamptz,
  review_notes     text,
  reason           text,
  notification_sent boolean    NOT NULL DEFAULT false,
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_requests_superadmin" ON public.approval_requests;
CREATE POLICY "approval_requests_superadmin"
  ON public.approval_requests
  FOR ALL
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "approval_requests_self_read" ON public.approval_requests;
CREATE POLICY "approval_requests_self_read"
  ON public.approval_requests
  FOR SELECT
  USING (requested_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_approval_requests_status
  ON public.approval_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
  ON public.approval_requests(requested_by);

-- Unified dashboard_actions view across all 9 source modules
CREATE OR REPLACE VIEW public.dashboard_actions AS

SELECT
  mf.id::text                                                    AS action_id,
  'mmp_lifecycle'                                                AS action_type,
  'mmp_files'                                                    AS source_table,
  COALESCE(mf.uploaded_by::text, '')                             AS sender_id,
  COALESCE(p_mf.full_name, mf.uploaded_by::text, 'Unknown')     AS sender_name,
  'dataCollector'                                                AS sender_role,
  'admin'                                                        AS recipient_role,
  mf.status                                                      AS native_status,
  mf.created_at,
  COALESCE(mf.updated_at, mf.created_at)                         AS updated_at,
  to_jsonb(mf.*)                                                 AS details
FROM public.mmp_files mf
LEFT JOIN public.profiles p_mf ON p_mf.id::text = mf.uploaded_by
WHERE mf.status IS DISTINCT FROM 'draft'

UNION ALL

SELECT
  mse.id::text                                                   AS action_id,
  'mmp_site_entry'                                               AS action_type,
  'mmp_site_entries'                                             AS source_table,
  COALESCE(mf2.uploaded_by::text, '')                            AS sender_id,
  COALESCE(p_mse.full_name, mse.site_name, 'Unknown')           AS sender_name,
  'dataCollector'                                                AS sender_role,
  'coordinator'                                                  AS recipient_role,
  mse.status                                                     AS native_status,
  mse.created_at,
  COALESCE(mse.updated_at, mse.created_at)                       AS updated_at,
  to_jsonb(mse.*)                                                AS details
FROM public.mmp_site_entries mse
LEFT JOIN public.mmp_files mf2 ON mf2.id = mse.mmp_file_id
LEFT JOIN public.profiles p_mse ON p_mse.id::text = mf2.uploaded_by

UNION ALL

SELECT
  sv.id::text                                                    AS action_id,
  'site_visit'                                                   AS action_type,
  'site_visits'                                                  AS source_table,
  COALESCE(sv.assigned_to::text, '')                             AS sender_id,
  COALESCE(p_sv.full_name, sv.assigned_to::text, 'Unassigned')  AS sender_name,
  'dataCollector'                                                AS sender_role,
  'admin'                                                        AS recipient_role,
  sv.status                                                      AS native_status,
  sv.created_at,
  COALESCE(sv.updated_at, sv.created_at)                         AS updated_at,
  to_jsonb(sv.*)                                                 AS details
FROM public.site_visits sv
LEFT JOIN public.profiles p_sv ON p_sv.id::text = sv.assigned_to::text

UNION ALL

SELECT
  cs.id::text                                                    AS action_id,
  'cost_reimbursement'                                           AS action_type,
  'cost_submissions'                                             AS source_table,
  COALESCE(cs.submitted_by::text, '')                            AS sender_id,
  COALESCE(p_cs.full_name, cs.submitted_by::text, 'Unknown')    AS sender_name,
  'fieldOfficer'                                                 AS sender_role,
  'finance_admin'                                                AS recipient_role,
  cs.status                                                      AS native_status,
  cs.created_at,
  COALESCE(cs.updated_at, cs.created_at)                         AS updated_at,
  to_jsonb(cs.*)                                                 AS details
FROM public.site_visit_cost_submissions cs
LEFT JOIN public.profiles p_cs ON p_cs.id = cs.submitted_by

UNION ALL

SELECT
  ocs.id::text                                                   AS action_id,
  'operational_cost'                                             AS action_type,
  'operational_cost_submissions'                                 AS source_table,
  COALESCE(ocs.submitted_by::text, '')                           AS sender_id,
  COALESCE(p_ocs.full_name, ocs.submitted_by::text, 'Unknown')  AS sender_name,
  COALESCE(ocs.submitter_role, 'fieldOfficer')                   AS sender_role,
  'admin'                                                        AS recipient_role,
  ocs.status                                                     AS native_status,
  ocs.created_at,
  COALESCE(ocs.updated_at, ocs.created_at)                       AS updated_at,
  to_jsonb(ocs.*)                                                AS details
FROM public.operational_cost_submissions ocs
LEFT JOIN public.profiles p_ocs ON p_ocs.id = ocs.submitted_by

UNION ALL

SELECT
  dpr.id::text                                                   AS action_id,
  'advance_payment'                                              AS action_type,
  'down_payment_requests'                                        AS source_table,
  COALESCE(dpr.requested_by::text, '')                           AS sender_id,
  COALESCE(p_dpr.full_name, dpr.requested_by::text, 'Unknown')  AS sender_name,
  'fieldOfficer'                                                 AS sender_role,
  'admin'                                                        AS recipient_role,
  dpr.status                                                     AS native_status,
  dpr.created_at,
  COALESCE(dpr.updated_at, dpr.created_at)                       AS updated_at,
  to_jsonb(dpr.*)                                                AS details
FROM public.down_payment_requests dpr
LEFT JOIN public.profiles p_dpr ON p_dpr.id::text = dpr.requested_by::text

UNION ALL

SELECT
  wt.id::text                                                    AS action_id,
  'wallet_withdrawal'                                            AS action_type,
  'wallet_transactions'                                          AS source_table,
  COALESCE(wt.user_id::text, '')                                 AS sender_id,
  COALESCE(p_wt.full_name, wt.user_id::text, 'Unknown')         AS sender_name,
  'fieldOfficer'                                                 AS sender_role,
  'finance_admin'                                                AS recipient_role,
  wt.status::text                                                AS native_status,
  wt.created_at,
  COALESCE(wt.posted_at, wt.created_at)                          AS updated_at,
  to_jsonb(wt.*)                                                 AS details
FROM public.wallet_transactions wt
LEFT JOIN public.profiles p_wt ON p_wt.id::text = wt.user_id::text
WHERE wt.type = 'withdrawal'

UNION ALL

SELECT
  id::text                                                       AS action_id,
  'feedback'                                                     AS action_type,
  'feedback'                                                     AS source_table,
  COALESCE(user_id::text, '')                                    AS sender_id,
  COALESCE(user_name, user_email, user_id::text, 'Anonymous')   AS sender_name,
  'user'                                                         AS sender_role,
  'admin'                                                        AS recipient_role,
  status                                                         AS native_status,
  created_at,
  COALESCE(updated_at, created_at)                               AS updated_at,
  to_jsonb(feedback.*)                                           AS details
FROM public.feedback

UNION ALL

SELECT
  id::text                                                       AS action_id,
  'role_change'                                                  AS action_type,
  'approval_requests'                                            AS source_table,
  COALESCE(requested_by::text, '')                               AS sender_id,
  COALESCE(requested_by_name, requested_by::text, 'Unknown')     AS sender_name,
  'admin'                                                        AS sender_role,
  'superAdmin'                                                   AS recipient_role,
  status                                                         AS native_status,
  created_at,
  COALESCE(updated_at, created_at)                               AS updated_at,
  to_jsonb(approval_requests.*)                                  AS details
FROM public.approval_requests;

-- Hourly schedule for 48h no-response auto-flagging is registered via
-- supabase/config.toml [functions.monitoring-flag-no-response] schedule cron="0 * * * *"
-- (Supabase-native function schedule; no pg_cron dependency required).
