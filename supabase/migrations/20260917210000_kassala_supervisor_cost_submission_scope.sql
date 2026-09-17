-- Mirror the Kassala supervisor Down Payment boundary for Cost Submissions:
-- global read/payment, Kassala-only Tier 1 approval/rejection, and no deletion
-- or higher-tier approval.

CREATE OR REPLACE FUNCTION public.get_user_permissions(user_uuid uuid)
RETURNS TABLE(resource varchar, action varchar, conditions jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT DISTINCT permission_set.resource::varchar,
                  permission_set.action::varchar,
                  permission_set.conditions
  FROM (
    SELECT p.resource::text, p.action::text, p.conditions
    FROM public.canonical_user_role_assignments a
    JOIN public.roles r ON r.id = a.role_id AND r.is_active = true
    JOIN public.permissions p ON p.role_id = r.id
    WHERE a.user_id = user_uuid
      AND NOT (
        public.is_kassala_hub_supervisor(user_uuid)
        AND p.resource IN ('down_payments', 'cost_submissions')
        AND p.action IN ('approve', 'delete')
      )

    UNION ALL

    SELECT scoped.resource, scoped.action, scoped.conditions
    FROM (VALUES
      ('down_payments'::text, 'read'::text, NULL::jsonb),
      ('down_payments'::text, 'mark_paid'::text, NULL::jsonb),
      ('down_payments'::text, 'approve'::text, '{"tier":"supervisor","hub":"Kassala"}'::jsonb),
      ('cost_submissions'::text, 'read'::text, NULL::jsonb),
      ('cost_submissions'::text, 'mark_paid'::text, NULL::jsonb),
      ('cost_submissions'::text, 'approve'::text, '{"tier":"supervisor","hub":"Kassala"}'::jsonb),
      ('pre_funding'::text, 'use_for_payment'::text, NULL::jsonb)
    ) AS scoped(resource, action, conditions)
    WHERE public.is_kassala_hub_supervisor(user_uuid)
  ) permission_set;
$function$;

REVOKE ALL ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_user_has_resource_permission(
  p_resource text,
  p_action text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  caller uuid := auth.uid();
  override_value boolean;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN true; END IF;
  IF caller IS NULL OR nullif(btrim(p_resource), '') IS NULL
     OR nullif(btrim(p_action), '') IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(caller) THEN RETURN true; END IF;

  IF public.is_kassala_hub_supervisor(caller)
     AND p_resource IN ('down_payments', 'cost_submissions')
     AND p_action = 'delete' THEN
    RETURN false;
  END IF;

  SELECT o.is_granted INTO override_value
  FROM public.user_permission_overrides o
  WHERE o.user_id = caller
    AND o.resource = p_resource
    AND o.action = p_action
    AND (o.expires_at IS NULL OR o.expires_at > now());
  IF FOUND THEN RETURN override_value; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.get_user_permissions(caller) p
    WHERE p.resource = p_resource AND p.action = p_action
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.current_user_has_resource_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_resource_permission(text, text) TO authenticated, service_role;

-- The main list is intentionally global only for Kassala supervisor
-- assignments. Every other caller retains the authoritative scope predicate.
CREATE OR REPLACE FUNCTION public.get_all_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT s.*
  FROM public.operational_cost_submissions s
  WHERE public.is_kassala_hub_supervisor(auth.uid())
     OR public.can_view_operational_cost_submission(s.id, auth.uid())
  ORDER BY s.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_all_operational_cost_submissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_operational_cost_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_finance_resource_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  before_row jsonb := to_jsonb(OLD);
  after_row jsonb := to_jsonb(NEW);
  resource text;
  approval_changed boolean;
  payment_changed boolean;
  v_is_kassala_request boolean;
  v_unapproved_changes boolean;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'operational_cost_submissions'
     AND current_setting('app.pre_fund_payment_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  resource := CASE WHEN TG_TABLE_NAME = 'down_payment_requests' THEN 'down_payments' ELSE 'cost_submissions' END;
  approval_changed := (before_row->>'status' IS DISTINCT FROM after_row->>'status'
      AND after_row->>'status' IN ('approved','rejected','under_review','pending_admin'))
    OR before_row->>'tier1_status' IS DISTINCT FROM after_row->>'tier1_status'
    OR before_row->>'tier2_status' IS DISTINCT FROM after_row->>'tier2_status'
    OR before_row->>'tier3_status' IS DISTINCT FROM after_row->>'tier3_status'
    OR before_row->>'tier4_status' IS DISTINCT FROM after_row->>'tier4_status'
    OR before_row->>'supervisor_approved_by' IS DISTINCT FROM after_row->>'supervisor_approved_by'
    OR before_row->>'admin_processed_by' IS DISTINCT FROM after_row->>'admin_processed_by';
  payment_changed := before_row->>'total_paid_amount' IS DISTINCT FROM after_row->>'total_paid_amount'
    OR before_row->>'amount_paid_cents' IS DISTINCT FROM after_row->>'amount_paid_cents'
    OR before_row->>'paid_amount_cents' IS DISTINCT FROM after_row->>'paid_amount_cents'
    OR before_row->>'wallet_transaction_id' IS DISTINCT FROM after_row->>'wallet_transaction_id'
    OR before_row->>'wallet_transaction_ids' IS DISTINCT FROM after_row->>'wallet_transaction_ids'
    OR (before_row->>'status' IS DISTINCT FROM after_row->>'status'
        AND after_row->>'status' IN ('paid','partially_paid','fully_paid'));

  IF public.is_kassala_hub_supervisor(auth.uid()) THEN
    IF TG_TABLE_NAME = 'down_payment_requests' THEN
      IF current_setting('app.down_payment_payment_authorized', true) = 'on' THEN
        RETURN NEW;
      END IF;

      IF approval_changed THEN
        SELECT EXISTS (
          SELECT 1 FROM public.hubs h
          WHERE h.id::text = OLD.hub_id::text
            AND regexp_replace(lower(coalesce(h.name, OLD.hub_name, '')), '[^a-z]', '', 'g')
                IN ('kassala', 'kassalahub')
        ) INTO v_is_kassala_request;

        IF NOT coalesce(v_is_kassala_request, false) THEN
          RAISE EXCEPTION 'Access denied: Tier 1 approval is limited to Kassala Hub requests.'
            USING ERRCODE = '42501';
        END IF;
        IF OLD.status IS DISTINCT FROM 'pending_supervisor'
           OR NEW.status NOT IN ('pending_admin', 'rejected')
           OR NEW.supervisor_approved_by IS DISTINCT FROM auth.uid()
           OR (NEW.status = 'pending_admin'
               AND (NEW.supervisor_status IS DISTINCT FROM 'approved'
                    OR NEW.admin_status IS DISTINCT FROM 'pending'))
           OR (NEW.status = 'rejected' AND NEW.supervisor_status IS DISTINCT FROM 'rejected') THEN
          RAISE EXCEPTION 'Access denied: Kassala supervisors may perform Tier 1 approval or rejection only.'
            USING ERRCODE = '42501';
        END IF;

        v_unapproved_changes :=
          (before_row - ARRAY[
            'supervisor_status','supervisor_approved_by','supervisor_approved_at',
            'supervisor_notes','supervisor_rejection_reason','remaining_amount',
            'status','admin_status','updated_at','metadata'
          ]::text[])
          IS DISTINCT FROM
          (after_row - ARRAY[
            'supervisor_status','supervisor_approved_by','supervisor_approved_at',
            'supervisor_notes','supervisor_rejection_reason','remaining_amount',
            'status','admin_status','updated_at','metadata'
          ]::text[]);
        IF v_unapproved_changes THEN
          RAISE EXCEPTION 'Access denied: Tier 1 approval attempted to change restricted fields.'
            USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'operational_cost_submissions' AND approval_changed THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.hubs h
        WHERE regexp_replace(lower(coalesce(h.name, '')), '[^a-z]', '', 'g')
                IN ('kassala', 'kassalahub')
          AND (
            public.canonical_operational_cost_hub_id(OLD.hub_id::text)
              = public.canonical_operational_cost_hub_id(h.id::text)
            OR EXISTS (
              SELECT 1 FROM public.profiles submitter
              WHERE submitter.id = OLD.submitted_by
                AND (
                  public.canonical_operational_cost_hub_id(submitter.hub_id::text)
                    = public.canonical_operational_cost_hub_id(h.id::text)
                  OR public.canonical_operational_cost_hub_id(submitter.secondary_hub_id::text)
                    = public.canonical_operational_cost_hub_id(h.id::text)
                )
            )
          )
      ) INTO v_is_kassala_request;

      IF NOT coalesce(v_is_kassala_request, false) THEN
        RAISE EXCEPTION 'Access denied: Cost Submission Tier 1 approval is limited to Kassala Hub.'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.tier1_status IS DISTINCT FROM 'pending'
         OR NEW.tier1_status NOT IN ('approved', 'rejected')
         OR NEW.tier1_approved_by IS DISTINCT FROM auth.uid()
         OR NEW.status NOT IN ('under_review', 'rejected')
         OR NEW.tier2_status IS DISTINCT FROM OLD.tier2_status
         OR NEW.tier3_status IS DISTINCT FROM OLD.tier3_status
         OR NEW.tier4_status IS DISTINCT FROM OLD.tier4_status
         OR NEW.tier2_approved_by IS DISTINCT FROM OLD.tier2_approved_by
         OR NEW.tier3_approved_by IS DISTINCT FROM OLD.tier3_approved_by
         OR NEW.tier4_approved_by IS DISTINCT FROM OLD.tier4_approved_by THEN
        RAISE EXCEPTION 'Access denied: Kassala supervisors may perform Cost Submission Tier 1 only.'
          USING ERRCODE = '42501';
      END IF;

      v_unapproved_changes :=
        (before_row - ARRAY[
          'tier1_status','tier1_approved_by','tier1_approved_at','tier1_notes',
          'status','rejection_reason','updated_at','supporting_documents'
        ]::text[])
        IS DISTINCT FROM
        (after_row - ARRAY[
          'tier1_status','tier1_approved_by','tier1_approved_at','tier1_notes',
          'status','rejection_reason','updated_at','supporting_documents'
        ]::text[]);
      IF v_unapproved_changes THEN
        RAISE EXCEPTION 'Access denied: Cost Submission Tier 1 attempted to change restricted fields.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF payment_changed THEN
    PERFORM public.assert_resource_permission(resource, 'approve');
    PERFORM public.assert_resource_permission('pre_funding', 'update');
    IF TG_TABLE_NAME = 'down_payment_requests' THEN
      PERFORM public.assert_resource_permission('wallets', 'update');
    END IF;
  ELSIF approval_changed THEN
    PERFORM public.assert_resource_permission(resource, 'approve');
  ELSE
    PERFORM public.assert_resource_permission(resource, 'update');
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_finance_resource_transition() FROM PUBLIC, authenticated, anon;