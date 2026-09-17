-- Show the Cost Submission submitter filter only for Salma, even when an Admin
-- role-level filter rule hides it. This changes presentation only, not row
-- visibility, payment authority, or approval authority.

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
    RAISE EXCEPTION 'Cannot configure Cost Submission filter: Salma profile was not found.';
  END IF;

  INSERT INTO public.filter_visibility_config (
    user_id,
    role,
    filter_key,
    is_hidden,
    updated_at
  ) VALUES (
    v_user_id,
    NULL,
    'cost-submission.user',
    false,
    now()
  )
  ON CONFLICT (user_id, filter_key) WHERE user_id IS NOT NULL DO UPDATE
  SET is_hidden = false,
      role = NULL,
      updated_at = now();
END;
$block$;