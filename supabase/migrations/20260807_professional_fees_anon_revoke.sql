-- Migration: Explicitly revoke anon / PUBLIC execute on get_project_professional_fees()
--
-- Why a separate migration?
-- The original function definition (20260807_professional_fees_rls_filter.sql)
-- may already be applied in production.  Supabase skips already-recorded
-- migration versions, so the REVOKE must live in a new file to guarantee it
-- executes in every environment where the prior migration has already run.
--
-- What this does:
-- • Strips EXECUTE from the anon role directly.
-- • Also revokes from PUBLIC, which covers any default-privilege inheritance
--   that Supabase may apply at project creation time.
-- • Re-asserts the authenticated grant so the function remains callable by
--   logged-in users even if PUBLIC is revoked.

REVOKE EXECUTE ON FUNCTION public.get_project_professional_fees(uuid) FROM PUBLIC, anon;

-- Re-assert authenticated access (idempotent; safe if already granted).
GRANT EXECUTE ON FUNCTION public.get_project_professional_fees(uuid) TO authenticated;
