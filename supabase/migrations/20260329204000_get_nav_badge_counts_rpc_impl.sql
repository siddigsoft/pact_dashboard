-- Remote had an empty stub migration for get_nav_badge_counts; apply full function body.

CREATE OR REPLACE FUNCTION public.get_nav_badge_counts(
  p_hub_id uuid DEFAULT NULL,
  p_role_supervisor boolean DEFAULT false,
  p_role_finance boolean DEFAULT false,
  p_role_coordinator boolean DEFAULT false,
  p_role_fom_or_admin boolean DEFAULT false,
  p_role_incident boolean DEFAULT false,
  p_is_data_collector boolean DEFAULT false,
  p_include_admin_bell boolean DEFAULT false,
  p_include_fom_verified boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'pendingCostTier1Hub', 0,
      'pendingDpSupervisor', 0,
      'pendingTier2Cost', 0,
      'pendingDpAdmin', 0,
      'pendingUsers', 0,
      'mmpVerifiedSites', 0,
      'pendingMmpCoordinator', 0,
      'pendingMmpUnassigned', 0,
      'pendingFinanceDp', 0,
      'unreadNotifications', 0,
      'openIncidents', 0,
      'pendingVerification', 0,
      'pendingWallet', 0,
      'pendingReclaimCount', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'pendingCostTier1Hub',
      CASE
        WHEN p_role_supervisor AND p_hub_id IS NOT NULL THEN (
          SELECT count(*)::int
          FROM operational_cost_submissions o
          WHERE o.hub_id = p_hub_id
            AND o.tier1_status = 'pending'
            AND o.submitted_by <> uid
        )
        ELSE 0
      END,
    'pendingDpSupervisor',
      CASE
        WHEN p_role_supervisor AND p_hub_id IS NOT NULL THEN (
          SELECT count(*)::int
          FROM down_payment_requests d
          WHERE d.hub_id = p_hub_id
            AND d.status = 'pending_supervisor'
        )
        ELSE 0
      END,
    'pendingTier2Cost',
      CASE
        WHEN p_role_fom_or_admin THEN (
          SELECT count(*)::int
          FROM operational_cost_submissions o
          WHERE o.tier1_status = 'approved'
            AND o.tier2_status = 'pending'
        )
        ELSE 0
      END,
    'pendingDpAdmin',
      CASE
        WHEN p_role_fom_or_admin AND p_include_admin_bell THEN (
          SELECT count(*)::int
          FROM down_payment_requests d
          WHERE d.status = 'pending_admin'
        )
        ELSE 0
      END,
    'pendingUsers',
      CASE
        WHEN p_role_fom_or_admin AND p_include_admin_bell THEN (
          SELECT count(*)::int
          FROM profiles p
          WHERE p.status = 'pending'
        )
        ELSE 0
      END,
    'mmpVerifiedSites',
      CASE
        WHEN p_role_fom_or_admin AND p_include_fom_verified THEN (
          SELECT count(*)::int
          FROM mmp_site_entries m
          WHERE m.status = 'verified'
        )
        ELSE 0
      END,
    'pendingMmpCoordinator',
      CASE
        WHEN p_role_coordinator THEN (
          SELECT count(*)::int
          FROM mmp_files f
          WHERE f.coordinator_id = uid
            AND f.status = ANY (ARRAY['forwarded_to_coordinator'::text, 'pending_acceptance'::text])
        )
        ELSE 0
      END,
    'pendingVerification',
      CASE
        WHEN p_role_coordinator THEN (
          SELECT count(*)::int
          FROM mmp_site_entries m
          WHERE m.accepted_by = uid
            AND lower(m.status::text) = 'dispatched'
        )
        ELSE 0
      END,
    'pendingMmpUnassigned',
      CASE
        WHEN p_role_fom_or_admin AND NOT p_role_coordinator THEN (
          SELECT count(*)::int
          FROM mmp_files f
          WHERE f.coordinator_id IS NULL
            AND f.status IS NOT NULL
            AND f.status <> ALL (
              ARRAY['completed'::text, 'archived'::text, 'deleted'::text, 'rejected'::text, 'cancelled'::text]
            )
        )
        ELSE 0
      END,
    'pendingFinanceDp',
      CASE
        WHEN p_role_finance THEN (
          SELECT count(*)::int
          FROM down_payment_requests d
          WHERE d.status = ANY (ARRAY['supervisor_approved'::text, 'pending_admin'::text])
        )
        ELSE 0
      END,
    'pendingReclaimCount',
      CASE
        WHEN p_role_finance THEN (
          SELECT count(*)::int
          FROM down_payment_requests d
          WHERE d.status <> 'cancelled'
            AND COALESCE(d.metadata->>'manual_reconciliation_required', 'false') = 'true'
        )
        ELSE 0
      END,
    'unreadNotifications',
      (SELECT count(*)::int FROM notifications n WHERE n.recipient_id = uid AND n.is_read = false),
    'openIncidents',
      CASE
        WHEN p_role_incident THEN (
          SELECT count(*)::int
          FROM incident_reports i
          WHERE i.status = ANY (ARRAY['open'::text, 'investigating'::text])
        )
        ELSE 0
      END,
    'pendingWallet',
      CASE
        WHEN p_role_coordinator OR p_is_data_collector THEN (
          SELECT count(*)::int
          FROM down_payment_requests d
          WHERE d.requested_by = uid
            AND d.status = 'supervisor_approved'
        )
        ELSE 0
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nav_badge_counts(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;
