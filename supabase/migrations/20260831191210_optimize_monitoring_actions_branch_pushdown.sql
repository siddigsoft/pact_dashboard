-- Push monitoring filters and page limits into each source branch.
-- The function signature and result shape remain unchanged, so the deployed
-- frontend does not require another API cutover.

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at
  ON public.site_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visit_cost_submissions_created_at
  ON public.site_visit_cost_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_created_at
  ON public.operational_cost_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON public.feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at
  ON public.approval_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type_created_at
  ON public.wallet_transactions (type, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_monitoring_actions_v2(
  p_type               text        DEFAULT NULL,
  p_from               timestamptz DEFAULT NULL,
  p_to                 timestamptz DEFAULT NULL,
  p_sender             text        DEFAULT NULL,
  p_limit              integer     DEFAULT 100,
  p_before_created_at  timestamptz DEFAULT NULL,
  p_before_action_id   text        DEFAULT NULL
)
RETURNS TABLE (
  action_id      text,
  action_type    text,
  source_table   text,
  sender_id      text,
  sender_name    text,
  sender_role    text,
  recipient_role text,
  native_status  text,
  created_at     timestamptz,
  updated_at     timestamptz,
  details        jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 250);
BEGIN
  IF COALESCE(public.is_super_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: super administrator required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT merged.*
  FROM (
    (
      SELECT
        mf.id::text, 'mmp_lifecycle'::text, 'mmp_files'::text,
        COALESCE(mf.uploaded_by, ''),
        COALESCE(p.full_name, mf.uploaded_by, 'Unknown'),
        'dataCollector'::text, 'admin'::text, mf.status,
        mf.created_at, COALESCE(mf.updated_at, mf.created_at), to_jsonb(mf.*)
      FROM public.mmp_files mf
      LEFT JOIN public.profiles p ON p.id::text = mf.uploaded_by
      WHERE (p_type IS NULL OR p_type = 'mmp_lifecycle')
        AND mf.status IS DISTINCT FROM 'draft'
        AND (p_from IS NULL OR mf.created_at >= p_from)
        AND (p_to IS NULL OR mf.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p.full_name, mf.uploaded_by, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (mf.created_at, mf.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY mf.created_at DESC, mf.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        mse.id::text, 'mmp_site_entry'::text, 'mmp_site_entries'::text,
        COALESCE(p_dc.id::text, p_ab.id::text, p_mse.id::text, mf.uploaded_by, ''),
        COALESCE(p_dc.full_name, mse.monitoring_by, p_ab.full_name, p_mse.full_name, mse.site_name, 'Unknown'),
        'dataCollector'::text, 'coordinator'::text, mse.status,
        mse.created_at, COALESCE(mse.updated_at, mse.created_at), to_jsonb(mse.*)
      FROM public.mmp_site_entries mse
      LEFT JOIN public.mmp_files mf ON mf.id = mse.mmp_file_id
      LEFT JOIN public.profiles p_mse ON p_mse.id::text = mf.uploaded_by
      LEFT JOIN public.profiles p_dc ON p_dc.email = mse.monitoring_by
      LEFT JOIN public.profiles p_ab ON p_ab.id::text = mse.accepted_by
      WHERE (p_type IS NULL OR p_type = 'mmp_site_entry')
        AND (p_from IS NULL OR mse.created_at >= p_from)
        AND (p_to IS NULL OR mse.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p_dc.full_name, mse.monitoring_by, p_ab.full_name, p_mse.full_name, mse.site_name, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (mse.created_at, mse.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY mse.created_at DESC, mse.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        sv.id::text, 'site_visit'::text, 'site_visits'::text,
        COALESCE(sv.assigned_to::text, ''), COALESCE(p.full_name, sv.assigned_to::text, 'Unassigned'),
        'dataCollector'::text, 'admin'::text, sv.status,
        sv.created_at, COALESCE(sv.updated_at, sv.created_at), to_jsonb(sv.*)
      FROM public.site_visits sv
      LEFT JOIN public.profiles p ON p.id::text = sv.assigned_to::text
      WHERE (p_type IS NULL OR p_type = 'site_visit')
        AND (p_from IS NULL OR sv.created_at >= p_from)
        AND (p_to IS NULL OR sv.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p.full_name, sv.assigned_to::text, 'Unassigned') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (sv.created_at, sv.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY sv.created_at DESC, sv.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        cs.id::text, 'cost_reimbursement'::text, 'cost_submissions'::text,
        COALESCE(cs.submitted_by::text, ''), COALESCE(p.full_name, cs.submitted_by::text, 'Unknown'),
        'fieldOfficer'::text, 'finance_admin'::text, cs.status,
        cs.created_at, COALESCE(cs.updated_at, cs.created_at), to_jsonb(cs.*)
      FROM public.site_visit_cost_submissions cs
      LEFT JOIN public.profiles p ON p.id = cs.submitted_by
      WHERE (p_type IS NULL OR p_type = 'cost_reimbursement')
        AND (p_from IS NULL OR cs.created_at >= p_from)
        AND (p_to IS NULL OR cs.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p.full_name, cs.submitted_by::text, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (cs.created_at, cs.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY cs.created_at DESC, cs.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        ocs.id::text, 'operational_cost'::text, 'operational_cost_submissions'::text,
        COALESCE(ocs.submitted_by::text, ''), COALESCE(p.full_name, ocs.submitted_by::text, 'Unknown'),
        COALESCE(ocs.submitter_role, 'fieldOfficer'), 'admin'::text, ocs.status,
        ocs.created_at, COALESCE(ocs.updated_at, ocs.created_at),
        to_jsonb(ocs.*) || jsonb_build_object('hub_name', COALESCE(h.name, '—'))
      FROM public.operational_cost_submissions ocs
      LEFT JOIN public.profiles p ON p.id = ocs.submitted_by
      LEFT JOIN public.hubs h ON h.id = ocs.hub_id
      WHERE (p_type IS NULL OR p_type = 'operational_cost')
        AND (p_from IS NULL OR ocs.created_at >= p_from)
        AND (p_to IS NULL OR ocs.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p.full_name, ocs.submitted_by::text, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (ocs.created_at, ocs.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY ocs.created_at DESC, ocs.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        dpr.id::text, 'advance_payment'::text, 'down_payment_requests'::text,
        COALESCE(dpr.requested_by::text, ''), COALESCE(p.full_name, dpr.requested_by::text, 'Unknown'),
        'fieldOfficer'::text, 'admin'::text, dpr.status,
        dpr.created_at, COALESCE(dpr.updated_at, dpr.created_at), to_jsonb(dpr.*)
      FROM public.down_payment_requests dpr
      LEFT JOIN public.profiles p ON p.id::text = dpr.requested_by::text
      WHERE (p_type IS NULL OR p_type = 'advance_payment')
        AND (p_from IS NULL OR dpr.created_at >= p_from)
        AND (p_to IS NULL OR dpr.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p.full_name, dpr.requested_by::text, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (dpr.created_at, dpr.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY dpr.created_at DESC, dpr.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        wt.id::text, 'wallet_withdrawal'::text, 'wallet_transactions'::text,
        COALESCE(wt.user_id::text, ''), COALESCE(p.full_name, wt.user_id::text, 'Unknown'),
        'fieldOfficer'::text, 'finance_admin'::text, wt.status::text,
        wt.created_at, COALESCE(wt.posted_at, wt.created_at), to_jsonb(wt.*)
      FROM public.wallet_transactions wt
      LEFT JOIN public.profiles p ON p.id::text = wt.user_id::text
      WHERE (p_type IS NULL OR p_type = 'wallet_withdrawal')
        AND wt.type = 'withdrawal'::public.wallet_tx_type
        AND (p_from IS NULL OR wt.created_at >= p_from)
        AND (p_to IS NULL OR wt.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(p.full_name, wt.user_id::text, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (wt.created_at, wt.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY wt.created_at DESC, wt.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        f.id::text, 'feedback'::text, 'feedback'::text,
        COALESCE(f.user_id::text, ''), COALESCE(f.user_name, f.user_email, f.user_id::text, 'Anonymous'),
        'user'::text, 'admin'::text, f.status,
        f.created_at, COALESCE(f.updated_at, f.created_at), to_jsonb(f.*)
      FROM public.feedback f
      WHERE (p_type IS NULL OR p_type = 'feedback')
        AND (p_from IS NULL OR f.created_at >= p_from)
        AND (p_to IS NULL OR f.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(f.user_name, f.user_email, f.user_id::text, 'Anonymous') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (f.created_at, f.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY f.created_at DESC, f.id::text DESC
      LIMIT v_limit
    )
    UNION ALL
    (
      SELECT
        ar.id::text, 'role_change'::text, 'approval_requests'::text,
        COALESCE(ar.requested_by::text, ''), COALESCE(ar.requested_by_name, ar.requested_by::text, 'Unknown'),
        'admin'::text, 'superAdmin'::text, ar.status,
        ar.created_at, COALESCE(ar.updated_at, ar.created_at), to_jsonb(ar.*)
      FROM public.approval_requests ar
      WHERE (p_type IS NULL OR p_type = 'role_change')
        AND (p_from IS NULL OR ar.created_at >= p_from)
        AND (p_to IS NULL OR ar.created_at <= p_to)
        AND (p_sender IS NULL OR COALESCE(ar.requested_by_name, ar.requested_by::text, 'Unknown') ILIKE '%' || p_sender || '%')
        AND (p_before_created_at IS NULL OR (ar.created_at, ar.id::text) < (p_before_created_at, COALESCE(p_before_action_id, E'\uffff')))
      ORDER BY ar.created_at DESC, ar.id::text DESC
      LIMIT v_limit
    )
  ) AS merged(
    action_id, action_type, source_table, sender_id, sender_name,
    sender_role, recipient_role, native_status, created_at, updated_at, details
  )
  ORDER BY merged.created_at DESC, merged.action_id DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monitoring_actions_v2(
  text, timestamptz, timestamptz, text, integer, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monitoring_actions_v2(
  text, timestamptz, timestamptz, text, integer, timestamptz, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_monitoring_actions_v2(
  text, timestamptz, timestamptz, text, integer, timestamptz, text
) IS 'Keyset-paginated monitoring feed with source-branch predicate and limit pushdown.';
