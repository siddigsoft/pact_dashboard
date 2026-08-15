-- =============================================================================
-- get_my_incentive_payments()
-- =============================================================================
-- A SECURITY DEFINER function so coordinators and supervisors can retrieve
-- their own incentive payment rows together with the snapshot lifecycle status
-- (mmp_incentive_snapshots is RLS-restricted to finance/admin, so a plain join
--  from the client always returns null for the snapshot columns for field staff).
--
-- The function hard-filters to auth.uid() == user_id, so it cannot expose
-- other users' rows even though it runs with elevated privileges.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_my_incentive_payments();

CREATE OR REPLACE FUNCTION public.get_my_incentive_payments()
RETURNS TABLE (
  id                   uuid,
  role                 text,
  hub_name             text,
  bonus_pct            numeric,
  bonus_amount_cents   bigint,
  currency             text,
  excluded             boolean,
  payment_status       text,   -- from mmp_incentive_payments.status
  payment_method       text,
  paid_at              timestamptz,
  snapshot_status      text,   -- from mmp_incentive_snapshots.status
  mmp_id               uuid,
  mmp_name             text,
  created_at           timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.role,
    p.hub_name,
    p.bonus_pct,
    p.bonus_amount_cents,
    p.currency,
    p.excluded,
    p.status            AS payment_status,
    p.payment_method,
    p.paid_at,
    s.status            AS snapshot_status,
    f.id                AS mmp_id,
    f.name              AS mmp_name,
    p.created_at
  FROM public.mmp_incentive_payments  p
  JOIN public.mmp_incentive_snapshots s ON s.id = p.snapshot_id
  LEFT JOIN public.mmp_files          f ON f.id = p.mmp_id
  WHERE p.user_id = auth.uid()
  ORDER BY p.created_at DESC;
$$;

-- Revoke public execute, then grant only to authenticated users.
-- The function itself enforces user_id = auth.uid() as the data guard.
REVOKE ALL ON FUNCTION public.get_my_incentive_payments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_incentive_payments() TO authenticated;

COMMENT ON FUNCTION public.get_my_incentive_payments() IS
  'Returns the calling user''s incentive payment rows with snapshot lifecycle status. '
  'SECURITY DEFINER bypasses the snapshots RLS restriction for field-staff callers; '
  'the WHERE user_id = auth.uid() clause ensures no cross-user data leakage.';
