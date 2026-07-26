-- Fix schema-drift / type-mismatch errors observed in Postgres logs
-- 1) ensure_user_default_role wrote status='active' (invalid; only online|offline)
-- 2) get_nav_badge_counts took p_hub_id uuid while hub_id columns are text

CREATE OR REPLACE FUNCTION public.ensure_user_default_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.user_roles (user_id, role, assigned_by, status)
  VALUES (v_uid, 'dataCollector', v_uid, 'offline')
  ON CONFLICT DO NOTHING;
END;
$$;

DROP FUNCTION IF EXISTS public.get_nav_badge_counts(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
);

CREATE OR REPLACE FUNCTION public.get_nav_badge_counts(
  p_hub_id text DEFAULT NULL,
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
          WHERE m.accepted_by = uid::text
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
      (
        SELECT count(*)::int
        FROM notifications n
        WHERE n.is_read = false
          AND n.created_at > now() - interval '30 days'
          AND (n.recipient_id = uid OR n.user_id = uid)
      ),
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
  text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated, anon, service_role;

-- profiles.hub_id / state_id / locality_id are TEXT; this RPC used UUID params
DROP FUNCTION IF EXISTS public.update_owner_profile_fields(text, text, text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.update_owner_profile_fields(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_employee_id text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_hub_id text DEFAULT NULL,
  p_state_id text DEFAULT NULL,
  p_locality_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET
    full_name   = COALESCE(p_full_name,   full_name),
    phone       = COALESCE(p_phone,        phone),
    employee_id = COALESCE(p_employee_id,  employee_id),
    avatar_url  = COALESCE(p_avatar_url,   avatar_url),
    hub_id      = COALESCE(p_hub_id,       hub_id),
    state_id    = COALESCE(p_state_id,     state_id),
    locality_id = COALESCE(p_locality_id,  locality_id)
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_owner_profile_fields(
  text, text, text, text, text, text, text
) TO authenticated, service_role;
