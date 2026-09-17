-- Allow Salma to export Down Payment reports without expanding her existing
-- payment-only authority or granting Down Payment approval access.

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
    RAISE EXCEPTION 'Cannot configure Down Payment export access: Salma profile was not found.';
  END IF;

  INSERT INTO public.user_permission_overrides (
    user_id,
    resource,
    action,
    is_granted,
    reason,
    expires_at,
    approved_at
  ) VALUES (
    v_user_id,
    'down_payments',
    'export',
    true,
    'May export reports from the Down-Payment Tracker.',
    NULL,
    now()
  )
  ON CONFLICT (user_id, resource, action) DO UPDATE
  SET is_granted = true,
      reason = EXCLUDED.reason,
      expires_at = NULL,
      updated_at = now(),
      approved_at = now();
END;
$block$;