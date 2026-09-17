-- Limit only Salma's Down-Payment Approval page to its Approval workspace.
-- Other users and their tab visibility remain unchanged.

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
    RAISE EXCEPTION 'Cannot configure Down Payment tabs: Salma profile was not found.';
  END IF;

  INSERT INTO public.page_access_overrides (
    user_id,
    page_slug,
    is_blocked,
    level,
    reason,
    expires_at,
    approved_at
  )
  SELECT
    v_user_id,
    tab.page_slug,
    tab.is_blocked,
    'view',
    'Salma uses only the Approval payment-processing workspace on Down-Payment Approval.',
    NULL,
    now()
  FROM (VALUES
    ('down-payment-approval:approval'::text, false),
    ('down-payment-approval:byState'::text, true),
    ('down-payment-approval:byProject'::text, true),
    ('down-payment-approval:byMMP'::text, true),
    ('down-payment-approval:allRequests'::text, true),
    ('down-payment-approval:disbursement'::text, true),
    ('down-payment-approval:coverage'::text, true)
  ) AS tab(page_slug, is_blocked)
  ON CONFLICT (user_id, page_slug) DO UPDATE
  SET is_blocked = EXCLUDED.is_blocked,
      level = EXCLUDED.level,
      reason = EXCLUDED.reason,
      expires_at = NULL,
      approved_at = now();
END;
$block$;