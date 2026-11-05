-- Fix mobile insert failures:
--   PostgrestException: new row violates row-level security policy
--   "canonical_capability_insert" for tables
--     - down_payment_requests
--     - operational_cost_submissions
--
-- That policy exists only on the live DB (not in prior repo migrations) and
-- blocks field users from creating advances / cost requests. This migration
-- removes capability-named insert blockers and restores role-based INSERT
-- policies that match the mobile + dashboard submit paths.

BEGIN;

-- ── 1) Drop live capability policies (any command) on both tables ───────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name, p.polname AS policy_name
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('down_payment_requests', 'operational_cost_submissions')
      AND p.polname ILIKE 'canonical_capability%'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policy_name,
      r.table_name
    );
  END LOOP;
END $$;

-- Also drop by exact known name in case pg_policy listing differs.
DROP POLICY IF EXISTS canonical_capability_insert ON public.down_payment_requests;
DROP POLICY IF EXISTS canonical_capability_insert ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "canonical_capability_insert" ON public.down_payment_requests;
DROP POLICY IF EXISTS "canonical_capability_insert" ON public.operational_cost_submissions;

-- ── 2) Restore operational_cost_submissions INSERT ──────────────────────────
DROP POLICY IF EXISTS "Authorized roles can create operational cost submissions"
  ON public.operational_cost_submissions;

CREATE POLICY "Authorized roles can create operational cost submissions"
  ON public.operational_cost_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = submitted_by
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = submitted_by
        AND coalesce(p.status, 'approved') = 'approved'
        AND lower(regexp_replace(coalesce(p.role, ''), '[^a-z]', '', 'g')) IN (
          'fom', 'fieldoperationmanager', 'fieldopmanager',
          'coordinator', 'fieldcoordinator', 'statecoordinator',
          'countrydirector',
          'admin', 'administrator',
          'superadmin',
          'supervisor', 'hubsupervisor',
          'financialadmin', 'financeadmin',
          'ict',
          'datacollector', 'enumerator',
          'datateam'
        )
    )
  );

-- Keep helper aligned with the policy (used by older policy variants).
CREATE OR REPLACE FUNCTION public.can_submit_operational_costs()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN lower(regexp_replace(coalesce(user_role, ''), '[^a-z]', '', 'g')) IN (
    'fom', 'fieldoperationmanager', 'fieldopmanager',
    'coordinator', 'fieldcoordinator', 'statecoordinator',
    'countrydirector',
    'admin', 'administrator',
    'superadmin',
    'supervisor', 'hubsupervisor',
    'financialadmin', 'financeadmin',
    'ict',
    'datacollector', 'enumerator',
    'datateam'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_submit_operational_costs() TO authenticated;

-- ── 3) Restore down_payment_requests INSERT ─────────────────────────────────
DROP POLICY IF EXISTS down_payment_requests_user_create ON public.down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_user_create" ON public.down_payment_requests;
DROP POLICY IF EXISTS down_payment_requests_insert_authenticated ON public.down_payment_requests;
DROP POLICY IF EXISTS "Authenticated users can insert down_payment_requests"
  ON public.down_payment_requests;

CREATE POLICY down_payment_requests_insert_own
  ON public.down_payment_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce(p.status, 'approved') = 'approved'
        AND lower(regexp_replace(coalesce(p.role, ''), '[^a-z]', '', 'g')) IN (
          'datacollector', 'enumerator',
          'coordinator', 'fieldcoordinator', 'statecoordinator',
          'supervisor', 'hubsupervisor',
          'fom', 'fieldoperationmanager', 'fieldopmanager',
          'admin', 'administrator', 'superadmin',
          'financialadmin', 'financeadmin',
          'ict', 'datateam', 'countrydirector'
        )
    )
  );

COMMIT;
