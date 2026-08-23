-- Keep the Cost Submission list aligned with Reconciliation for Admins and
-- Super Admins. A payment-linked source can be read directly from
-- Reconciliation even when a legacy list RPC omits it.
--
-- This function deliberately performs the join server-side and returns only
-- active payment links, avoiding a client-side scan of the Pre-Fund ledger.
-- `idx_pre_fund_transactions_reversal_of` from the Pre-Fund ledger migration
-- supports the active-payment reversal check below.

BEGIN;

-- Role labels in profiles can be human-readable (for example "Super Admin").
-- Normalize before stripping separators; doing it in the reverse order removes
-- uppercase characters and silently narrows Super Admin visibility.
CREATE OR REPLACE FUNCTION public.get_all_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_hub_id text;
  v_secondary_hub_id text;
  v_role_key text;
BEGIN
  SELECT
    hub_id,
    regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g'),
    location->>'secondary_hub_id'
  INTO v_hub_id, v_role_key, v_secondary_hub_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF public.is_admin_or_super_admin()
     OR v_role_key IN ('admin', 'administrator', 'superadmin', 'superadministrator', 'fom', 'fieldoperationmanager', 'countrydirector')
  THEN
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      ORDER BY created_at DESC;
  ELSIF v_role_key IN ('hubsupervisor', 'supervisor') THEN
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      WHERE hub_id = v_hub_id
         OR (v_secondary_hub_id IS NOT NULL AND hub_id = v_secondary_hub_id)
      ORDER BY created_at DESC;
  ELSE
    RETURN QUERY
      SELECT *
      FROM public.operational_cost_submissions
      WHERE submitted_by = auth.uid()
      ORDER BY created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_operational_cost_submissions() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_payment_linked_operational_cost_submissions()
RETURNS SETOF public.operational_cost_submissions
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_role_key TEXT;
  v_has_strict_user_role BOOLEAN;
BEGIN
  SELECT regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
  INTO v_role_key
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')
        IN ('admin', 'administrator', 'superadmin', 'superadministrator')
  )
  INTO v_has_strict_user_role;

  IF COALESCE(v_role_key, '') NOT IN ('admin', 'administrator', 'superadmin', 'superadministrator')
     AND NOT public.is_super_admin(auth.uid())
     AND NOT v_has_strict_user_role
  THEN
    RAISE EXCEPTION 'Access denied: only an Admin or Super Admin can view payment-linked cost submissions.';
  END IF;

  RETURN QUERY
  SELECT submission.*
  FROM public.operational_cost_submissions AS submission
  WHERE EXISTS (
    SELECT 1
    FROM public.pre_fund_transactions AS payment
    WHERE payment.source_table = 'operational_cost_submissions'
      AND payment.source_id = submission.id
      AND payment.transaction_type = 'payment'
      AND NOT EXISTS (
        SELECT 1
        FROM public.pre_fund_transactions AS reversal
        WHERE reversal.reversal_of_id = payment.id
          AND reversal.transaction_type = 'reversal'
      )
  )
  ORDER BY submission.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payment_linked_operational_cost_submissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_linked_operational_cost_submissions() TO authenticated;

COMMIT;