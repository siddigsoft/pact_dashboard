-- Keep Salma's Admin navigation and global Down Payment payment capabilities,
-- but explicitly remove Down Payment approval authority. The browser presents
-- Approved, Processing, and Completed payment views with individual and batch
-- payment controls; approval/rejection controls remain unavailable.

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
    RAISE EXCEPTION 'Cannot configure Down Payment processing: Salma profile was not found.';
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
    capability.is_granted,
    capability.reason,
    NULL,
    now()
  FROM (VALUES
    (
      'down_payments'::text,
      'mark_paid'::text,
      true,
      'Global Down Payment processing, including individual and batch payment.'
    ),
    (
      'pre_funding'::text,
      'use_for_payment'::text,
      true,
      'May use an eligible Pre-Fund while processing Down Payments.'
    ),
    (
      'down_payments'::text,
      'approve'::text,
      false,
      'Payment processing only; Down Payment Tier 1 and Tier 2 approval are excluded.'
    )
  ) AS capability(resource, action, is_granted, reason)
  ON CONFLICT (user_id, resource, action) DO UPDATE
  SET is_granted = EXCLUDED.is_granted,
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