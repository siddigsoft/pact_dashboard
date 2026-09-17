-- Give Salma explicit global payment capabilities for Down Payments and Cost
-- Submissions while preserving the individual Tier 2 Approvals page block.
--
-- This does not grant approval, rejection, reversal, reconciliation, deletion,
-- Payroll, wallet administration, or any other Finance capability.

DO $block$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT p.id
    INTO v_user_id
  FROM public.profiles p
  WHERE lower(btrim(p.email)) = 'salma@pactorg.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot configure payment access: Salma profile was not found.';
  END IF;

  INSERT INTO public.user_permission_overrides (
    user_id,
    resource,
    action,
    is_granted,
    reason,
    expires_at,
    approved_at
  )
  SELECT
    v_user_id,
    capability.resource,
    capability.action,
    true,
    'Global Down Payment and Cost Submission payment authority; no approval authority.',
    NULL,
    now()
  FROM (VALUES
    ('down_payments'::text, 'mark_paid'::text),
    ('cost_submissions'::text, 'mark_paid'::text),
    ('pre_funding'::text, 'use_for_payment'::text)
  ) AS capability(resource, action)
  ON CONFLICT (user_id, resource, action) DO UPDATE
  SET is_granted = true,
      reason = EXCLUDED.reason,
      expires_at = NULL,
      updated_at = now(),
      approved_at = now();

  INSERT INTO public.page_access_overrides (
    user_id,
    page_slug,
    is_blocked,
    level,
    reason,
    expires_at,
    approved_at
  ) VALUES (
    v_user_id,
    'tier2-approvals',
    true,
    'view',
    'Tier 2 approval is explicitly excluded from this Admin payment role.',
    NULL,
    now()
  )
  ON CONFLICT (user_id, page_slug) DO UPDATE
  SET is_blocked = true,
      level = 'view',
      reason = EXCLUDED.reason,
      expires_at = NULL,
      approved_at = now();
END;
$block$;