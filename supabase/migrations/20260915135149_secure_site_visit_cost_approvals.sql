-- Secure the high-risk transitions in the legacy site-visit cost workflow.
-- Page visibility and client-side button state are not authorization boundaries.

-- These identifiers are already sent by the client. Make the persisted schema
-- explicit (and keep this safe for environments where they were added manually).
ALTER TABLE public.site_visit_cost_submissions
  ADD COLUMN IF NOT EXISTS approval_signature_id uuid,
  ADD COLUMN IF NOT EXISTS payment_signature_id uuid;

CREATE OR REPLACE FUNCTION public.can_execute_cost_submission_action(p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  override_value boolean;
BEGIN
  IF caller IS NULL OR p_action <> 'approve' THEN
    RETURN false;
  END IF;

  -- An unexpired per-user override is authoritative, including an explicit block.
  SELECT upo.is_granted
    INTO override_value
    FROM public.user_permission_overrides upo
   WHERE upo.user_id = caller
     AND upo.resource = 'cost_submissions'
     AND upo.action = p_action
     AND (upo.expires_at IS NULL OR upo.expires_at > now())
   LIMIT 1;

  IF FOUND THEN
    RETURN override_value;
  END IF;

  IF public.is_super_admin(caller) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.get_user_permissions(caller) permission
     WHERE permission.resource = 'cost_submissions'
       AND permission.action = p_action
  ) THEN
    RETURN true;
  END IF;

  -- Preserve the established reviewer roles while custom roles use permissions above.
  RETURN EXISTS (
    SELECT 1
      FROM public.profiles profile
     WHERE profile.id = caller
       AND lower(regexp_replace(coalesce(profile.role, ''), '[^a-z0-9]+', '', 'g')) IN (
         'admin', 'financialadmin', 'fom', 'fieldoperationmanager',
         'supervisor', 'hubsupervisor', 'countrydirector', 'ict',
         'senioroperationslead'
       )
  ) OR EXISTS (
    SELECT 1
      FROM public.user_roles role_assignment
     WHERE role_assignment.user_id = caller
       AND lower(regexp_replace(coalesce(role_assignment.role, ''), '[^a-z0-9]+', '', 'g')) IN (
         'admin', 'financialadmin', 'fom', 'fieldoperationmanager',
         'supervisor', 'hubsupervisor', 'countrydirector', 'ict',
         'senioroperationslead'
       )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_mark_site_visit_cost_paid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_super_admin(auth.uid())
    OR (
      public.can_execute_cost_submission_action('approve')
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles profile
           WHERE profile.id = auth.uid()
             AND lower(regexp_replace(coalesce(profile.role, ''), '[^a-z0-9]+', '', 'g'))
                 IN ('admin', 'financialadmin')
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles role_assignment
           WHERE role_assignment.user_id = auth.uid()
             AND lower(regexp_replace(coalesce(role_assignment.role, ''), '[^a-z0-9]+', '', 'g'))
                 IN ('admin', 'financialadmin')
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.transition_site_visit_cost_submission(
  p_submission_id uuid,
  p_action text,
  p_reviewer_notes text DEFAULT NULL,
  p_approval_notes text DEFAULT NULL,
  p_adjusted_amount_cents bigint DEFAULT NULL,
  p_payment_notes text DEFAULT NULL,
  p_wallet_transaction_id uuid DEFAULT NULL,
  p_signature_id uuid DEFAULT NULL
)
RETURNS SETOF public.site_visit_cost_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  submission public.site_visit_cost_submissions%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO submission
    FROM public.site_visit_cost_submissions
   WHERE id = p_submission_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost submission not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action IN ('approve', 'reject', 'request_revision') THEN
    IF NOT public.can_execute_cost_submission_action('approve') THEN
      RAISE EXCEPTION 'You are not allowed to review cost submissions' USING ERRCODE = '42501';
    END IF;

    IF submission.status NOT IN ('pending', 'under_review') THEN
      RAISE EXCEPTION 'Only pending or under-review submissions can be reviewed' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
      UPDATE public.site_visit_cost_submissions AS cost
         SET reviewed_by = caller,
             reviewed_at = now(),
             reviewer_notes = p_reviewer_notes,
             approval_notes = p_approval_notes,
             approval_signature_id = CASE WHEN p_signature_id IS NULL THEN cost.approval_signature_id ELSE p_signature_id END,
             paid_amount_cents = CASE
               WHEN p_action = 'approve' AND p_adjusted_amount_cents IS NOT NULL THEN p_adjusted_amount_cents
               ELSE cost.paid_amount_cents
             END,
             payment_notes = CASE
               WHEN p_action = 'approve' AND p_payment_notes IS NOT NULL THEN p_payment_notes
               ELSE cost.payment_notes
             END,
             status = CASE p_action
               WHEN 'approve' THEN 'approved'
               WHEN 'reject' THEN 'rejected'
               ELSE 'under_review'
             END
       WHERE cost.id = p_submission_id
       RETURNING cost.*;
    RETURN;
  END IF;

  IF p_action = 'mark_paid' THEN
    IF NOT public.can_mark_site_visit_cost_paid() THEN
      RAISE EXCEPTION 'You are not allowed to mark cost submissions paid' USING ERRCODE = '42501';
    END IF;

    IF submission.status <> 'approved' THEN
      RAISE EXCEPTION 'Only approved submissions can be marked paid' USING ERRCODE = 'P0001';
    END IF;

    IF p_wallet_transaction_id IS NULL THEN
      RAISE EXCEPTION 'A wallet transaction is required to mark a submission paid' USING ERRCODE = '22004';
    END IF;

    RETURN QUERY
      UPDATE public.site_visit_cost_submissions AS cost
         SET status = 'paid',
             wallet_transaction_id = p_wallet_transaction_id,
             paid_at = now(),
             paid_amount_cents = coalesce(p_adjusted_amount_cents, cost.paid_amount_cents, cost.total_cost_cents),
             payment_signature_id = CASE WHEN p_signature_id IS NULL THEN cost.payment_signature_id ELSE p_signature_id END
       WHERE cost.id = p_submission_id
       RETURNING cost.*;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unsupported cost-submission action: %', p_action USING ERRCODE = '22023';
END;
$$;

-- Remove the old reviewer-wide direct UPDATE policy. Submitters may still edit
-- their own pending draft, but cannot set an approval/payment state themselves.
DROP POLICY IF EXISTS "Admins can update submissions" ON public.site_visit_cost_submissions;
DROP POLICY IF EXISTS "Users can update own pending submissions" ON public.site_visit_cost_submissions;
CREATE POLICY "Users can update own pending submissions"
  ON public.site_visit_cost_submissions
  FOR UPDATE TO authenticated
  USING (submitted_by = (select auth.uid()) AND status = 'pending')
  WITH CHECK (submitted_by = (select auth.uid()) AND status = 'pending');

REVOKE ALL ON FUNCTION public.can_execute_cost_submission_action(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_mark_site_visit_cost_paid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_site_visit_cost_submission(uuid, text, text, text, bigint, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_site_visit_cost_submission(uuid, text, text, text, bigint, text, uuid, uuid) TO authenticated;
